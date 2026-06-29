<?php

namespace App\Models\Employee;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Employee extends Authenticatable
{
    use HasApiTokens;

    protected $connection = 'employee_mysql';

    protected $table = 'employees';

    protected $guarded = [];

    protected $hidden = [
        'password',
        'password_hash',
        'remember_token',
    ];

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function designation(): BelongsTo
    {
        return $this->belongsTo(Designation::class);
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    public function getAuthPassword(): string
    {
        return (string) ($this->password_hash ?? $this->password ?? '');
    }

    public function tokenCan($ability): bool
    {
        return true;
    }
}
