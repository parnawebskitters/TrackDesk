<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

class VerifyOtpRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'email:rfc,dns'],
            'otp' => ['required', 'digits:6'],
            'device_name' => ['nullable', 'string', 'max:120'],
        ];
    }
}
