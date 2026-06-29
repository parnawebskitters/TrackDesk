<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Tasks\UpdateTaskStatusRequest;
use App\Services\TaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function __construct(private readonly TaskService $tasks)
    {
    }

    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'tasks' => $this->tasks->assignedTasks($request->user())
                ->map(fn ($task) => $this->tasks->serialize($task))
                ->values(),
        ]);
    }

    public function show(Request $request, int|string $task): JsonResponse
    {
        return response()->json([
            'task' => $this->tasks->serialize(
                $this->tasks->taskForEmployee($request->user(), $task)
            ),
        ]);
    }

    public function updateStatus(UpdateTaskStatusRequest $request, int|string $task): JsonResponse
    {
        return response()->json([
            'task' => $this->tasks->serialize(
                $this->tasks->updateStatus($request->user(), $task, $request->string('status')->toString())
            ),
        ]);
    }
}
