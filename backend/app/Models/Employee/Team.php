<?php

namespace App\Models\Employee;

use Illuminate\Database\Eloquent\Model;

class Team extends Model
{
    protected $connection = 'employee_mysql';

    protected $table = 'teams';

    public $timestamps = false;

    protected $guarded = [];
}
