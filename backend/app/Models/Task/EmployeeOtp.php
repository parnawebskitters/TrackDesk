<?php

namespace App\Models\Task;

use Illuminate\Database\Eloquent\Model;

class EmployeeOtp extends Model
{
    protected $connection = 'employee_mysql';

    protected $table = 'login_otps';

    protected $guarded = [];

    public const UPDATED_AT = null;

    protected $casts = [
        'created_at' => 'datetime',
    ];
}
