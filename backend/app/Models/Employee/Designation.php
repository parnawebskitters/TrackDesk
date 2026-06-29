<?php

namespace App\Models\Employee;

use Illuminate\Database\Eloquent\Model;

class Designation extends Model
{
    protected $connection = 'employee_mysql';

    protected $table = 'designations';

    public $timestamps = false;

    protected $guarded = [];
}
