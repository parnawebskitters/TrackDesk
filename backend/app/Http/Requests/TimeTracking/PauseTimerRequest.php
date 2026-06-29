<?php

namespace App\Http\Requests\TimeTracking;

use Illuminate\Foundation\Http\FormRequest;

class PauseTimerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'task_id' => ['required', 'integer'],
            'started_at' => ['required', 'date'],
            'stopped_at' => ['nullable', 'date', 'after_or_equal:started_at'],
            'elapsed_ms' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
