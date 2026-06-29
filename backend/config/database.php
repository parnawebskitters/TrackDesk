<?php

use Illuminate\Support\Str;

return [
    'default' => env('DB_CONNECTION', 'task_mysql'),

    'connections' => [
        'employee_mysql' => [
            'driver' => 'mysql',
            'read' => [
                'host' => [env('EMPLOYEE_DB_HOST', '127.0.0.1')],
            ],
            'write' => [
                'host' => [env('EMPLOYEE_DB_HOST', '127.0.0.1')],
            ],
            'sticky' => false,
            'port' => env('EMPLOYEE_DB_PORT', '3306'),
            'database' => env('EMPLOYEE_DB_DATABASE', 'employee_db'),
            'username' => env('EMPLOYEE_DB_USERNAME', 'trackdesk_employee_ro'),
            'password' => env('EMPLOYEE_DB_PASSWORD', ''),
            'unix_socket' => env('EMPLOYEE_DB_SOCKET', ''),
            'charset' => env('EMPLOYEE_DB_CHARSET', 'utf8mb4'),
            'collation' => env('EMPLOYEE_DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? array_filter([
                PDO::MYSQL_ATTR_SSL_CA => env('MYSQL_ATTR_SSL_CA'),
            ]) : [],
        ],

        'task_mysql' => [
            'driver' => 'mysql',
            'host' => env('TASK_DB_HOST', '127.0.0.1'),
            'port' => env('TASK_DB_PORT', '3306'),
            'database' => env('TASK_DB_DATABASE', 'task_db'),
            'username' => env('TASK_DB_USERNAME', 'trackdesk_task_rw'),
            'password' => env('TASK_DB_PASSWORD', ''),
            'unix_socket' => env('TASK_DB_SOCKET', ''),
            'charset' => env('TASK_DB_CHARSET', 'utf8mb4'),
            'collation' => env('TASK_DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? array_filter([
                PDO::MYSQL_ATTR_SSL_CA => env('MYSQL_ATTR_SSL_CA'),
            ]) : [],
        ],
    ],

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],

    'redis' => [
        'client' => env('REDIS_CLIENT', 'phpredis'),
        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', Str::slug(env('APP_NAME', 'trackdesk'), '_').'_database_'),
        ],
    ],
];
