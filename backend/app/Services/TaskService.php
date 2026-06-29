<?php

namespace App\Services;

use App\Models\Employee\Employee;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use stdClass;

class TaskService
{
    public function assignedTasks(Employee $employee): Collection
    {
        $email = $this->employeeEmail($employee);

        return $this->assignedTaskQuery($email)
            ->orderByRaw("CASE items.status WHEN 'to_do' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END")
            ->orderByRaw('items.due_date IS NULL')
            ->orderBy('items.due_date')
            ->orderBy('items.id')
            ->get();
    }

    public function taskForEmployee(Employee $employee, int|string $taskId): stdClass
    {
        return $this->assignedTaskQuery($this->employeeEmail($employee))
            ->where('items.id', $taskId)
            ->firstOrFail();
    }

    public function updateStatus(Employee $employee, int|string $taskId, string $status): stdClass
    {
        $databaseStatus = $this->toDatabaseStatus($status);
        $email = $this->employeeEmail($employee);

        return DB::connection('task_mysql')->transaction(function () use ($email, $taskId, $databaseStatus) {
            $task = $this->assignedTaskQuery($email)
                ->where('items.id', $taskId)
                ->firstOrFail();

            DB::connection('task_mysql')
                ->table('pms_workboard_workboard_items')
                ->where('id', $task->id)
                ->update([
                    'status' => $databaseStatus,
                    'updated_at' => now(),
                ]);

            return $this->assignedTaskQuery($email)
                ->where('items.id', $taskId)
                ->firstOrFail();
        });
    }

    public function serialize(stdClass $task): array
    {
        return [
            'id' => (string) $task->id,
            'name' => $task->title,
            'title' => $task->title,
            'projectName' => $task->project_name ?: 'Unassigned project',
            'projectUniqueId' => $task->project_unique_id,
            'dueDate' => $task->due_date,
            'estimatedHours' => round(((int) ($task->original_estimate_minutes ?? 0)) / 60, 2),
            'status' => $this->toTrackDeskStatus($task->status),
            'databaseStatus' => $task->status,
            'updatedAt' => $task->updated_at,
        ];
    }

    private function assignedTaskQuery(string $email)
    {
        return DB::connection('task_mysql')
            ->table('pms_workboard_workboard_items as items')
            ->join('users', 'users.id', '=', 'items.assignee_id')
            ->leftJoin('projects', 'projects.id', '=', 'items.project_id')
            ->where('users.email', $email)
            ->whereNull('users.deleted_at')
            ->where('users.active', 1)
            ->whereNull('items.deleted_at')
            ->whereIn('items.status', ['to_do', 'in_progress', 'completed'])
            ->select([
                'items.id',
                'items.workboard_id',
                'items.project_id',
                'items.assignee_id',
                'items.title',
                'items.due_date',
                'items.original_estimate_minutes',
                'items.status',
                'items.updated_at',
                'projects.unique_id as project_unique_id',
                'projects.project_name',
            ]);
    }

    private function employeeEmail(Employee $employee): string
    {
        return (string) ($employee->official_email ?? $employee->email);
    }

    private function toTrackDeskStatus(string $status): string
    {
        return match ($status) {
            'to_do' => 'active',
            'in_progress' => 'in_progress',
            'completed' => 'completed',
            default => 'active',
        };
    }

    private function toDatabaseStatus(string $status): string
    {
        $normalized = Str::of($status)->lower()->replace(' ', '_')->toString();

        return match ($normalized) {
            'active', 'to_do' => 'to_do',
            'in_progress' => 'in_progress',
            'completed' => 'completed',
            default => 'to_do',
        };
    }
}
