<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Sync\UploadOfflineEntriesRequest;
use App\Services\SyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SyncController extends Controller
{
    public function __construct(private readonly SyncService $sync)
    {
    }

    public function upload(UploadOfflineEntriesRequest $request): JsonResponse
    {
        return response()->json([
            'sessions' => $this->sync->uploadOfflineEntries(
                $request->user(),
                $request->validated('entries')
            ),
        ]);
    }

    public function download(Request $request): JsonResponse
    {
        return response()->json($this->sync->downloadDelta($request->user()));
    }

    public function pending(Request $request): JsonResponse
    {
        return response()->json($this->sync->downloadDelta($request->user()));
    }
}
