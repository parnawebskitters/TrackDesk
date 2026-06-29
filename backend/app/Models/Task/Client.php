<?php

namespace App\Models\Task;

use Illuminate\Database\Eloquent\Model;

class Client extends Model
{
    protected $connection = 'task_mysql';

    protected $table = 'clients';

    protected $guarded = [];
}
