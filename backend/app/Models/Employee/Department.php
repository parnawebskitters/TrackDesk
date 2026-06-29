<?php

namespace App\Models\Employee;

use Illuminate\Database\Eloquent\Model;

class Department extends Model
{
    protected $connection = 'employee_mysql';

    protected $table = 'departments';

    public $timestamps = false;

    protected $guarded = [];
}
