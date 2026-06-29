<?php

namespace App\Http\Requests\TimeTracking;

use Illuminate\Foundation\Http\FormRequest;

class ResumeTimerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'task_id' => ['required', 'integer'],
            'started_at' => ['nullable', 'date'],
            'elapsed_ms' => ['required', 'integer', 'min:0'],
            'resume_token' => ['nullable', 'string', 'max:120'],
        ];
    }
}
