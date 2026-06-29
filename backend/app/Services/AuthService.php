<?php

namespace App\Services;

use App\Models\Employee\Employee;
use App\Models\Task\EmployeeOtp;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

class AuthService
{
    public function sendOtp(string $email): array
    {
        $employee = $this->activeEmployeeByEmail($email);
        $officialEmail = $this->employeeEmail($employee);
        $this->invalidateExpiredOtps($officialEmail);
        $this->assertOtpCooldownElapsed($officialEmail);
        $this->invalidateOpenOtps($officialEmail);

        $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $expiresAt = now()->addMinutes($this->otpTtlMinutes());

        EmployeeOtp::query()->create([
            'email' => $officialEmail,
            'otp' => Hash::make($otp),
            'created_at' => now(),
        ]);

        $this->sendOtpEmail($employee, $otp, $expiresAt);

        Log::info('TrackDesk OTP sent', ['employee_id' => $employee->getKey(), 'email' => $officialEmail]);

        return [
            'message' => 'A verification code has been sent to your email.',
            'expiresInSeconds' => $this->otpTtlMinutes() * 60,
            'resendCooldownSeconds' => $this->otpCooldownSeconds(),
        ];
    }

    public function resendOtp(string $email): array
    {
        return $this->sendOtp($email);
    }

    public function verifyOtp(string $email, string $otp, string $deviceName = 'TrackDesk Desktop'): array
    {
        $employee = $this->activeEmployeeByEmail($email);
        $officialEmail = $this->employeeEmail($employee);
        $this->invalidateExpiredOtps($officialEmail);
        $record = EmployeeOtp::query()
            ->where('email', $officialEmail)
            ->orderByDesc('created_at')
            ->first();

        if (! $record || $record->created_at->copy()->addMinutes($this->otpTtlMinutes())->isPast()) {
            throw ValidationException::withMessages([
                'otp' => 'The verification code has expired. Please request a new code.',
            ]);
        }

        if (! $this->otpMatches($otp, (string) $record->otp)) {
            Log::warning('TrackDesk OTP verification failed', [
                'employee_id' => $employee->getKey(),
            ]);

            throw ValidationException::withMessages([
                'otp' => 'Invalid verification code.',
            ]);
        }

        $record->delete();

        $token = $employee->createToken($deviceName, ['trackdesk'], $this->tokenExpiresAt())->plainTextToken;

        Log::info('TrackDesk OTP verified', ['employee_id' => $employee->getKey()]);

        return [
            'accessToken' => $token,
            'tokenType' => 'Bearer',
            'employee' => $this->serializeEmployee($employee->loadMissing(['department', 'designation', 'team'])),
        ];
    }

    public function refresh(Employee $employee, string $deviceName = 'TrackDesk Desktop'): array
    {
        $employee->currentAccessToken()?->delete();

        return [
            'accessToken' => $employee->createToken($deviceName, ['trackdesk'], $this->tokenExpiresAt())->plainTextToken,
            'tokenType' => 'Bearer',
            'employee' => $this->serializeEmployee($employee->loadMissing(['department', 'designation', 'team'])),
        ];
    }

    public function serializeEmployee(Employee $employee): array
    {
        return [
            'id' => (string) $employee->getKey(),
            'name' => $employee->name ?? trim(($employee->first_name ?? '').' '.($employee->last_name ?? '')),
            'email' => $this->employeeEmail($employee),
            'department' => $employee->department?->name,
            'designation' => $employee->designation?->name,
            'team' => $employee->team?->name,
            'status' => $employee->status ?? 'active',
        ];
    }

    private function activeEmployeeByEmail(string $email): Employee
    {
        $employee = Employee::query()
            ->with(['department', 'designation', 'team'])
            ->where('official_email', $email)
            ->first();

        if (! $employee) {
            Log::warning('TrackDesk OTP requested for unknown email', ['email' => $email]);
            throw ValidationException::withMessages([
                'email' => 'No active employee was found for this email address.',
            ]);
        }

        if (($employee->status ?? 'active') !== 'active') {
            Log::warning('TrackDesk OTP requested for inactive employee', ['employee_id' => $employee->getKey()]);
            throw ValidationException::withMessages([
                'email' => 'This employee account is not active.',
            ]);
        }

        return $employee;
    }

    private function employeeEmail(Employee $employee): string
    {
        return (string) $employee->official_email;
    }

    private function otpMatches(string $otp, string $storedOtp): bool
    {
        if (str_starts_with($storedOtp, '$2y$') || str_starts_with($storedOtp, '$argon')) {
            return Hash::check($otp, $storedOtp);
        }

        return hash_equals($storedOtp, $otp);
    }

    private function assertOtpCooldownElapsed(string $email): void
    {
        $latest = EmployeeOtp::query()
            ->where('email', $email)
            ->orderByDesc('created_at')
            ->first();

        if (! $latest) {
            return;
        }

        $nextAllowedAt = $latest->created_at->copy()->addSeconds($this->otpCooldownSeconds());
        if ($nextAllowedAt->isFuture()) {
            throw ValidationException::withMessages([
                'email' => 'Please wait before requesting another verification code.',
            ])->status(429);
        }
    }

    private function invalidateOpenOtps(string $email): void
    {
        EmployeeOtp::query()
            ->where('email', $email)
            ->delete();
    }

    private function invalidateExpiredOtps(string $email): void
    {
        EmployeeOtp::query()
            ->where('email', $email)
            ->where('created_at', '<=', now()->subMinutes($this->otpTtlMinutes()))
            ->delete();
    }

    private function sendOtpEmail(Employee $employee, string $otp, Carbon $expiresAt): void
    {
        Mail::raw(
            "Your TrackDesk verification code is {$otp}. It expires at {$expiresAt->format('H:i')}.",
            function ($message) use ($employee) {
                $message->to($this->employeeEmail($employee))
                    ->subject('Your TrackDesk verification code');
            }
        );
    }

    private function otpTtlMinutes(): int
    {
        return (int) env('OTP_EXPIRY_MINUTES', 5);
    }

    private function otpCooldownSeconds(): int
    {
        return (int) env('OTP_RESEND_COOLDOWN_SECONDS', 60);
    }

    private function maxOtpAttempts(): int
    {
        return (int) env('OTP_MAX_ATTEMPTS', 5);
    }

    private function otpLockSeconds(): int
    {
        return (int) env('OTP_LOCK_SECONDS', 300);
    }

    private function tokenExpiresAt(): ?Carbon
    {
        $minutes = (int) env('SANCTUM_TOKEN_EXPIRY_MINUTES', 0);

        return $minutes > 0 ? now()->addMinutes($minutes) : null;
    }
}
