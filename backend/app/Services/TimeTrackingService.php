<?php

namespace App\Services;

use App\Models\Employee\Employee;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use stdClass;

class TimeTrackingService
{
    public function __construct(private readonly TaskService $tasks)
    {
    }

    public function start(Employee $employee, array $payload): array
    {
        return DB::connection('task_mysql')->transaction(function () use ($employee, $payload) {
            $task = $this->tasks->taskForEmployee($employee, $payload['task_id']);
            $employeeId = $employee->getKey();
            $startedAt = Carbon::parse($payload['started_at'] ?? now());

            $this->assertNoRunningWorkboardSessionForUser($task->assignee_id);

            DB::connection('task_mysql')
                ->table('pms_workboard_workboard_items')
                ->where('id', $task->id)
                ->update([
                    'status' => 'in_progress',
                    'updated_at' => now(),
                ]);

            $this->createRunningWorkboardSession($task, $startedAt);

            return $this->serializeTimerPayload($employeeId, $task->id, $startedAt, (int) ($payload['elapsed_ms'] ?? 0), true);
        });
    }

    public function pause(Employee $employee, array $payload): array
    {
        return DB::connection('task_mysql')->transaction(function () use ($employee, $payload) {
            $employeeId = $employee->getKey();
            $task = $this->tasks->taskForEmployee($employee, $payload['task_id']);
            $stoppedAt = Carbon::parse($payload['stopped_at'] ?? now());
            $runningSession = $this->latestRunningWorkboardSession($task);

            if (! $runningSession) {
                throw ValidationException::withMessages([
                    'task_id' => 'No running timer session was found for this task.',
                ]);
            }

            $startedAt = Carbon::parse($runningSession->started_at);
            DB::connection('task_mysql')
                ->table('pms_workboard_workboard_task_timer_sessions')
                ->where('id', $runningSession->id)
                ->update([
                    'active_user_id' => null,
                    'status' => 'paused',
                    'stopped_at' => $stoppedAt,
                    'last_started_at' => $startedAt,
                    'total_elapsed_seconds' => max(0, $startedAt->diffInSeconds($stoppedAt)),
                    'pause_count' => DB::raw('pause_count + 1'),
                    'updated_by' => $task->assignee_id,
                    'updated_at' => now(),
                ]);

            DB::connection('task_mysql')
                ->table('pms_workboard_workboard_items')
                ->where('id', $task->id)
                ->update([
                    'status' => 'in_progress',
                    'updated_at' => now(),
                ]);

            return $this->serializeTimerPayload($employeeId, $task->id, $startedAt, (int) ($payload['elapsed_ms'] ?? 0), false);
        });
    }

    public function resume(Employee $employee, array $payload): array
    {
        return DB::connection('task_mysql')->transaction(function () use ($employee, $payload) {
            $task = $this->tasks->taskForEmployee($employee, $payload['task_id']);
            $employeeId = $employee->getKey();
            $startedAt = Carbon::parse($payload['started_at'] ?? now());

            $this->assertCanResume($task);
            $this->assertNoRunningWorkboardSessionForUser($task->assignee_id);

            DB::connection('task_mysql')
                ->table('pms_workboard_workboard_items')
                ->where('id', $task->id)
                ->update([
                    'status' => 'in_progress',
                    'updated_at' => now(),
                ]);

            $this->createRunningWorkboardSession($task, $startedAt);

            return $this->serializeTimerPayload($employeeId, $task->id, $startedAt, (int) $payload['elapsed_ms'], true);
        });
    }

    public function stop(Employee $employee, array $payload): stdClass
    {
        return DB::connection('task_mysql')->transaction(function () use ($employee, $payload) {
            $employeeId = $employee->getKey();
            $task = $this->tasks->taskForEmployee($employee, $payload['task_id']);
            $stoppedAt = Carbon::parse($payload['stopped_at']);
            $runningSession = $this->latestRunningWorkboardSession($task, true);
            $finalSessionId = $runningSession?->id;

            if (! $runningSession) {
                $existingLog = $this->finalTimeLogForTask($task);

                if ($existingLog) {
                    return $this->serializeCompletedSession($employeeId, $task, $payload, $existingLog);
                }

                $pausedSession = $this->latestPausedWorkboardSession($task, true);

                if (! $pausedSession) {
                    throw ValidationException::withMessages([
                        'task_id' => 'No running or paused timer session was found for this task.',
                    ]);
                }

                $finalSessionId = $pausedSession->id;
                $this->stopPausedWorkboardSession($task, $pausedSession);
            }

            if ($runningSession) {
                $this->stopRunningWorkboardSession($task, $runningSession, $stoppedAt);
            }

            $timeLog = $this->createFinalTimeLog($task, $finalSessionId, $stoppedAt);

            DB::connection('task_mysql')
                ->table('pms_workboard_workboard_items')
                ->where('id', $task->id)
                ->update([
                    'status' => 'completed',
                    'updated_at' => now(),
                ]);

            return $this->serializeCompletedSession($employeeId, $task, $payload, $timeLog);
        });
    }

    private function createRunningWorkboardSession(stdClass $task, Carbon $startedAt): void
    {
        DB::connection('task_mysql')
            ->table('pms_workboard_workboard_task_timer_sessions')
            ->insert([
                'work_item_id' => $task->id,
                'project_id' => $task->project_id,
                'board_id' => $task->workboard_id,
                'user_id' => $task->assignee_id,
                'active_user_id' => $task->assignee_id,
                'status' => 'running',
                'started_at' => $startedAt,
                'stopped_at' => null,
                'last_started_at' => $startedAt,
                'total_elapsed_seconds' => 0,
                'source' => 'task_timer',
                'created_by' => $task->assignee_id,
                'updated_by' => $task->assignee_id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
    }

    private function latestRunningWorkboardSession(stdClass $task, bool $lock = false): ?stdClass
    {
        $query = DB::connection('task_mysql')
            ->table('pms_workboard_workboard_task_timer_sessions')
            ->where('work_item_id', $task->id)
            ->where('user_id', $task->assignee_id)
            ->where('active_user_id', $task->assignee_id)
            ->where('status', 'running')
            ->orderByDesc('id');

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->first();
    }

    private function latestPausedWorkboardSession(stdClass $task, bool $lock = false): ?stdClass
    {
        $query = DB::connection('task_mysql')
            ->table('pms_workboard_workboard_task_timer_sessions')
            ->where('work_item_id', $task->id)
            ->where('user_id', $task->assignee_id)
            ->where('status', 'paused')
            ->orderByDesc('id');

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->first();
    }

    private function assertCanResume(stdClass $task): void
    {
        $latest = DB::connection('task_mysql')
            ->table('pms_workboard_workboard_task_timer_sessions')
            ->where('work_item_id', $task->id)
            ->where('user_id', $task->assignee_id)
            ->orderByDesc('id')
            ->first();

        if (! $latest || $latest->status !== 'paused') {
            throw ValidationException::withMessages([
                'task_id' => 'This task cannot be resumed because its latest timer session is not paused.',
            ]);
        }
    }

    private function stopRunningWorkboardSession(stdClass $task, stdClass $runningSession, Carbon $stoppedAt): void
    {
        $startedAt = Carbon::parse($runningSession->started_at);
        DB::connection('task_mysql')
            ->table('pms_workboard_workboard_task_timer_sessions')
            ->where('id', $runningSession->id)
            ->update([
                'active_user_id' => null,
                'status' => 'stopped',
                'stopped_at' => $stoppedAt,
                'last_started_at' => $startedAt,
                'total_elapsed_seconds' => max(0, $startedAt->diffInSeconds($stoppedAt)),
                'updated_by' => $task->assignee_id,
                'updated_at' => now(),
            ]);
    }

    private function stopPausedWorkboardSession(stdClass $task, stdClass $pausedSession): void
    {
        DB::connection('task_mysql')
            ->table('pms_workboard_workboard_task_timer_sessions')
            ->where('id', $pausedSession->id)
            ->update([
                'active_user_id' => null,
                'status' => 'stopped',
                'updated_by' => $task->assignee_id,
                'updated_at' => now(),
            ]);
    }

    private function createFinalTimeLog(stdClass $task, int|string $timerSessionId, Carbon $stoppedAt): stdClass
    {
        $existingLog = $this->finalTimeLogForTask($task);
        if ($existingLog) {
            return $existingLog;
        }

        $sessions = DB::connection('task_mysql')
            ->table('pms_workboard_workboard_task_timer_sessions')
            ->where('work_item_id', $task->id)
            ->where('user_id', $task->assignee_id)
            ->whereIn('status', ['paused', 'stopped'])
            ->lockForUpdate()
            ->get();

        if ($sessions->isEmpty()) {
            throw ValidationException::withMessages([
                'task_id' => 'No stopped timer sessions were found for this task.',
            ]);
        }

        $totalSeconds = (int) $sessions->sum(fn ($session) => (int) $session->total_elapsed_seconds);
        $firstStartedAt = $sessions
            ->pluck('started_at')
            ->filter()
            ->map(fn ($value) => Carbon::parse($value))
            ->sort()
            ->first();

        $logId = DB::connection('task_mysql')
            ->table('pms_workboard_workboard_task_time_logs')
            ->insertGetId([
                'timer_session_id' => $timerSessionId,
                'work_item_id' => $task->id,
                'project_id' => $task->project_id,
                'board_id' => $task->workboard_id,
                'user_id' => $task->assignee_id,
                'started_at' => $firstStartedAt,
                'stopped_at' => $stoppedAt,
                'duration_seconds' => $totalSeconds,
                'duration_minutes' => intdiv($totalSeconds, 60),
                'duration_hours_decimal' => round($totalSeconds / 3600, 2),
                'source' => 'timer',
                'is_system_generated' => 1,
                'created_by' => $task->assignee_id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

        return DB::connection('task_mysql')
            ->table('pms_workboard_workboard_task_time_logs')
            ->where('id', $logId)
            ->first();
    }

    private function assertNoRunningWorkboardSessionForUser(int|string $userId): void
    {
        $runningSession = DB::connection('task_mysql')
            ->table('pms_workboard_workboard_task_timer_sessions')
            ->where('active_user_id', $userId)
            ->where('status', 'running')
            ->lockForUpdate()
            ->first();

        if ($runningSession) {
            throw ValidationException::withMessages([
                'task_id' => 'A timer is already running for this employee.',
            ]);
        }
    }

    private function finalTimeLogForTask(stdClass $task): ?stdClass
    {
        return DB::connection('task_mysql')
            ->table('pms_workboard_workboard_task_time_logs')
            ->where('work_item_id', $task->id)
            ->where('user_id', $task->assignee_id)
            ->where('source', 'timer')
            ->where('is_system_generated', 1)
            ->orderByDesc('id')
            ->lockForUpdate()
            ->first();
    }

    private function serializeCompletedSession(int|string $employeeId, stdClass $task, array $payload, stdClass $timeLog): stdClass
    {
        return (object) [
            'id' => $timeLog->id,
            'sync_id' => $payload['sync_id'],
            'employee_id' => $employeeId,
            'task_id' => $task->id,
            'started_at' => $timeLog->started_at ? Carbon::parse($timeLog->started_at) : Carbon::parse($payload['started_at']),
            'stopped_at' => $timeLog->stopped_at ? Carbon::parse($timeLog->stopped_at) : Carbon::parse($payload['stopped_at']),
            'duration_ms' => ((int) $timeLog->duration_seconds) * 1000,
            'time_log_id' => $timeLog->id,
        ];
    }

    public function todayLogs(int|string $employeeId)
    {
        return collect();
    }

    public function serializeSession(object $session): array
    {
        return [
            'id' => (string) $session->id,
            'syncId' => $session->sync_id,
            'employeeId' => (string) $session->employee_id,
            'taskId' => (string) $session->task_id,
            'startedAt' => $session->started_at?->toISOString(),
            'stoppedAt' => $session->stopped_at?->toISOString(),
            'durationMs' => $session->duration_ms,
        ];
    }

    private function serializeTimerPayload(int|string $employeeId, int|string $taskId, Carbon $startedAt, int $elapsedMs, bool $isRunning): array
    {
        return [
            'employeeId' => (string) $employeeId,
            'taskId' => (string) $taskId,
            'startedAt' => $startedAt->toISOString(),
            'elapsedMs' => $elapsedMs,
            'isRunning' => $isRunning,
            'resumeToken' => null,
        ];
    }
}
