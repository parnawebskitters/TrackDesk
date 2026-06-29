<?php

namespace App\Services;

use App\Models\Employee\Employee;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class SyncService
{
    public function __construct(
        private readonly TaskService $tasks,
        private readonly TimeTrackingService $timeTracking,
    ) {
    }

    public function uploadOfflineEntries(Employee $employee, array $entries): array
    {
        $results = [];
        $employeeId = $employee->getKey();

        DB::connection('task_mysql')->transaction(function () use ($employee, $employeeId, $entries, &$results) {
            foreach ($entries as $entry) {
                try {
                    $session = $this->timeTracking->stop($employee, $entry);
                    $response = $this->timeTracking->serializeSession($session);
                    $results[] = $response;
                } catch (\Throwable $error) {
                    Log::error('TrackDesk sync entry failed', [
                        'sync_id' => $entry['sync_id'],
                        'employee_id' => $employeeId,
                        'error' => $error->getMessage(),
                    ]);
                    throw $error;
                }
            }
        });

        return $results;
    }

    public function downloadDelta(Employee $employee): array
    {
        return [
            'tasks' => $this->tasks->assignedTasks($employee)
                ->map(fn ($task) => $this->tasks->serialize($task))
                ->values(),
        ];
    }
}
