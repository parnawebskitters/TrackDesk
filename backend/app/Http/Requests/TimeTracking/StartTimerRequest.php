<?php

namespace App\Http\Requests\TimeTracking;

use Illuminate\Foundation\Http\FormRequest;

class StartTimerRequest extends FormRequest
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
            'elapsed_ms' => ['nullable', 'integer', 'min:0'],
        ];
    }
}
