<?php

namespace App\Models\Task;

use Illuminate\Database\Eloquent\Model;

class RunningTimer extends Model
{
    protected $connection = 'task_mysql';

    protected $table = 'running_timers';

    protected $guarded = [];

    protected $casts = [
        'started_at' => 'datetime',
        'elapsed_ms' => 'integer',
        'is_running' => 'boolean',
    ];
}
