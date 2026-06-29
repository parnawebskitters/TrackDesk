<?php

namespace App\Models\Task;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Task extends Model
{
    protected $connection = 'task_mysql';

    protected $table = 'tasks';

    protected $guarded = [];

    protected $casts = [
        'due_date' => 'date',
        'estimated_hours' => 'float',
    ];

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function timeSessions(): HasMany
    {
        return $this->hasMany(TimeSession::class);
    }
}
