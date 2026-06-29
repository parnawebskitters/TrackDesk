<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\TimeTracking\PauseTimerRequest;
use App\Http\Requests\TimeTracking\ResumeTimerRequest;
use App\Http\Requests\TimeTracking\StartTimerRequest;
use App\Http\Requests\TimeTracking\StopTimerRequest;
use App\Services\TimeTrackingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TimeTrackingController extends Controller
{
    public function __construct(private readonly TimeTrackingService $timeTracking)
    {
    }

    public function start(StartTimerRequest $request): JsonResponse
    {
        return response()->json([
            'timer' => $this->timeTracking->start($request->user(), $request->validated()),
        ]);
    }

    public function stop(StopTimerRequest $request): JsonResponse
    {
        $session = $this->timeTracking->stop($request->user(), $request->validated());

        return response()->json([
            'session' => $this->timeTracking->serializeSession($session),
        ]);
    }

    public function pause(PauseTimerRequest $request): JsonResponse
    {
        return response()->json([
            'timer' => $this->timeTracking->pause($request->user(), $request->validated()),
        ]);
    }

    public function resume(ResumeTimerRequest $request): JsonResponse
    {
        return response()->json([
            'timer' => $this->timeTracking->resume($request->user(), $request->validated()),
        ]);
    }

    public function today(Request $request): JsonResponse
    {
        return response()->json([
            'logs' => $this->timeTracking->todayLogs($request->user()->getKey())
                ->map(fn ($session) => $this->timeTracking->serializeSession($session))
                ->values(),
        ]);
    }
}
