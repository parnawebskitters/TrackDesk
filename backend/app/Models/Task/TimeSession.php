<?php

namespace App\Models\Task;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TimeSession extends Model
{
    protected $connection = 'task_mysql';

    protected $table = 'time_sessions';

    protected $guarded = [];

    protected $casts = [
        'started_at' => 'datetime',
        'stopped_at' => 'datetime',
        'duration_ms' => 'integer',
        'metadata' => 'array',
    ];

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }
}
