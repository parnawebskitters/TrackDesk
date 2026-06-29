<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\TimeTrackingController;
use App\Models\Task\PersonalAccessToken;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;

Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);

$registerTrackDeskApiRoutes = function (): void {
    Route::post('/auth/send-otp', [AuthController::class, 'sendOtp'])
        ->middleware('throttle:5,1');
    Route::post('/auth/resend-otp', [AuthController::class, 'resendOtp'])
        ->middleware('throttle:5,1');
    Route::post('/auth/verify-otp', [AuthController::class, 'verifyOtp'])
        ->middleware('throttle:20,1');

    Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function () {
        Route::post('/auth/refresh', [AuthController::class, 'refresh']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);

        Route::get('/tasks', [TaskController::class, 'index']);
        Route::get('/tasks/{task}', [TaskController::class, 'show']);
        Route::patch('/tasks/{task}/status', [TaskController::class, 'updateStatus']);

        Route::post('/time/timer/start', [TimeTrackingController::class, 'start']);
        Route::post('/time/timer/pause', [TimeTrackingController::class, 'pause']);
        Route::post('/time/timer/stop', [TimeTrackingController::class, 'stop']);
        Route::post('/time/timer/resume', [TimeTrackingController::class, 'resume']);
        Route::get('/time/logs/today', [TimeTrackingController::class, 'today']);

        Route::post('/sync/offline-entries', [SyncController::class, 'upload']);
        Route::get('/sync/tasks', [SyncController::class, 'download']);
        Route::post('/sync/pending', [SyncController::class, 'pending']);
    });
};

Route::group([], $registerTrackDeskApiRoutes);
Route::prefix('v1')->group($registerTrackDeskApiRoutes);
