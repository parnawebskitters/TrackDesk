<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\SendOtpRequest;
use App\Http\Requests\Auth\VerifyOtpRequest;
use App\Services\AuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuthController extends Controller
{
    public function __construct(private readonly AuthService $auth)
    {
    }

    public function sendOtp(SendOtpRequest $request): JsonResponse
    {
        return response()->json($this->auth->sendOtp(
            $request->string('email')->toString(),
        ));
    }

    public function resendOtp(SendOtpRequest $request): JsonResponse
    {
        return response()->json($this->auth->resendOtp(
            $request->string('email')->toString(),
        ));
    }

    public function verifyOtp(VerifyOtpRequest $request): JsonResponse
    {
        return response()->json($this->auth->verifyOtp(
            $request->string('email')->toString(),
            $request->string('otp')->toString(),
            $request->string('device_name', 'TrackDesk Desktop')->toString(),
        ));
    }

    public function refresh(Request $request): JsonResponse
    {
        return response()->json($this->auth->refresh(
            $request->user(),
            $request->string('device_name', 'TrackDesk Desktop')->toString(),
        ));
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'employee' => $this->auth->serializeEmployee(
                $request->user()->loadMissing(['department', 'designation', 'team'])
            ),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Logged out.']);
    }
}
