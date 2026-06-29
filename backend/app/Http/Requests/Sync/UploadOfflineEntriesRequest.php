<?php

namespace App\Http\Requests\Sync;

use Illuminate\Foundation\Http\FormRequest;

class UploadOfflineEntriesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'entries' => ['required', 'array', 'min:1', 'max:100'],
            'entries.*.sync_id' => ['required', 'uuid'],
            'entries.*.task_id' => ['required', 'integer'],
            'entries.*.started_at' => ['required', 'date'],
            'entries.*.stopped_at' => ['required', 'date'],
            'entries.*.duration_ms' => ['required', 'integer', 'min:1000'],
            'entries.*.metadata' => ['nullable', 'array'],
        ];
    }
}
