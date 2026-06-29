<?php

namespace App\Http\Requests\TimeTracking;

use Illuminate\Foundation\Http\FormRequest;

class StopTimerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'sync_id' => ['required', 'uuid'],
            'task_id' => ['required', 'integer'],
            'started_at' => ['required', 'date'],
            'stopped_at' => ['required', 'date', 'after_or_equal:started_at'],
            'duration_ms' => ['required', 'integer', 'min:1000'],
            'metadata' => ['nullable', 'array'],
        ];
    }
}
