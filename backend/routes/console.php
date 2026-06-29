<?php

use Illuminate\Support\Facades\Artisan;

Artisan::command('trackdesk:ping', function (): void {
    $this->info('TrackDesk API is ready.');
});
