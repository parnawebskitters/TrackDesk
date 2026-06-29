# TrackDesk

TrackDesk is an offline-first Electron desktop time tracking application modeled after Hubstaff. It supports employee authentication, assigned task tracking, crash-safe timer recovery, local SQLite persistence, background synchronization, Windows auto-start, administrator-controlled exit, and secure Laravel API connectivity to two MySQL databases.

## Highlights

- Electron desktop app with email OTP authentication and a custom title bar that exposes Minimize and Maximize, but no user-facing Close button.
- Window close and standard quit paths are blocked; the app hides to the background unless an administrator exits from Settings.
- Running timer state is persisted every few seconds and immediately on lifecycle events.
- After a power failure or restart, an active timer is restored from the last saved elapsed time without counting powered-off time.
- Local SQLite stores employee data, tasks, timer sessions, pending API requests, settings, and the running timer state.
- Synchronization service retries pending sessions, refreshes task assignments, and uses idempotency keys to avoid duplicate submissions.
- Authentication tokens are encrypted with Electron `safeStorage`.
- Windows builds register the app for login startup.
- `electron-updater` is wired for update checks.
- Electron never connects to MySQL directly. All production database access goes through the Laravel REST API in `backend/`.

## Project Structure

```text
src/
  main/
    main.js                 Electron lifecycle, IPC, window restrictions
    preload.js              Secure renderer bridge
    config.js               Environment-driven configuration
    services/
      apiClient.js          Employee DB and Task DB REST clients
      authService.js        Login, cached employee, secure token storage
      database.js           SQLite schema and local persistence
      syncService.js        Background sync engine
      taskService.js        Assigned task cache and refresh
      timerService.js       Durable one-task timer engine
      logger.js             File and console logging
  renderer/
    index.html              App shell
    renderer.js             UI state and IPC calls
    styles.css              Desktop dashboard styling
backend/
  config/
    database.php            Two MySQL connections: employee_mysql and task_mysql
    auth.php                Employee auth provider for Sanctum-protected APIs
  routes/api.php            Versioned REST API routes
  app/
    Models/                 Employee DB and Task DB models with fixed connections
    Services/               Auth, task, time tracking, and sync business logic
    Http/Controllers/Api/   REST controllers
    Http/Requests/          Server-side request validation
  database/migrations/      Task DB tables for tokens, sessions, timers, sync IDs
```

## Configuration

Copy `.env.example` into your Electron deployment environment and set:

```text
LARAVEL_API_BASE_URL=http://127.0.0.1:8000/api/v1
API_TIMEOUT_MS=15000
SYNC_INTERVAL_SECONDS=60
TIMER_PERSIST_INTERVAL_SECONDS=5
ADMIN_EXIT_PASSWORD=change-this-admin-password
```

Copy `backend/.env.example` into the Laravel deployment environment and set the MySQL credentials there:

```text
DB_CONNECTION=task_mysql
EMPLOYEE_DB_HOST=127.0.0.1
EMPLOYEE_DB_PORT=3306
EMPLOYEE_DB_DATABASE=employee_db
EMPLOYEE_DB_USERNAME=trackdesk_employee_ro
EMPLOYEE_DB_PASSWORD=...

TASK_DB_HOST=127.0.0.1
TASK_DB_PORT=3306
TASK_DB_DATABASE=task_db
TASK_DB_USERNAME=trackdesk_task_rw
TASK_DB_PASSWORD=...
```

The Employee MySQL connection is read-only and used to verify active employee email addresses/profile data. The Task MySQL connection is read/write and owns assigned tasks, OTP records, time sessions, task status updates, running timer snapshots, sync submissions, and Sanctum API tokens.

## Laravel API Contracts

Base URL:

```text
http://127.0.0.1:8000/api/v1
```

Authentication:

- `POST /auth/send-otp`
- `POST /auth/verify-otp`
- `POST /auth/resend-otp`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

OTP behavior:

- six-digit numeric code generated with secure randomness
- code is stored server-side as a hash
- default expiry is 5 minutes
- default resend cooldown is 60 seconds
- default verification limit is 5 failed attempts
- successful verification marks the OTP as used and returns a Sanctum bearer token

Tasks:

- `GET /tasks`
- `GET /tasks/{task}`
- `PATCH /tasks/{task}/status`

Time tracking:

- `POST /time/timer/start`
- `POST /time/timer/stop`
- `POST /time/timer/resume`
- `GET /time/logs/today`

Synchronization:

- `POST /sync/offline-entries`
- `GET /sync/tasks`
- `POST /sync/pending`

Offline uploads include both an `Idempotency-Key` header and per-session `sync_id` UUID. The Laravel API stores `sync_id` uniquely to prevent duplicate time submissions.

## Development

Install dependencies:

```bash
npm install
```

Run the app:

```bash
npm run dev
```

The Electron app loads `.env` from the project root during development. Set `LARAVEL_API_BASE_URL` there to the running Laravel API, for example `http://127.0.0.1:8000/api/v1`.

Set up the Laravel API from `backend/` inside a Laravel application:

```bash
composer install
php artisan migrate --database=task_mysql
php artisan route:list
```

Configure SMTP in `backend/.env` so the API can send OTP email:

```text
MAIL_MAILER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USERNAME=...
MAIL_PASSWORD=...
MAIL_ENCRYPTION=tls
MAIL_FROM_ADDRESS=no-reply@trackdesk.example.com
```

Build a Windows installer:

```bash
npm run dist:win
```

## Recovery Behavior

When a timer starts, TrackDesk saves employee ID, task ID, start time, elapsed time, and running status to SQLite. While the timer runs, elapsed time is persisted at the configured interval. On restart, the app restores the active task and resumes from the persisted elapsed value. It does not add the shutdown duration.

## Offline Behavior

If either production service is unavailable, TrackDesk continues using local cached employee and task data. Completed sessions remain in SQLite as pending records and are retried by the sync engine on the next successful connectivity check, on manual sync, and after timer stop.

## Security Notes

- MySQL hostnames, usernames, and passwords belong only in Laravel `.env` files.
- Electron stores only the HTTPS Laravel API URL and the employee API token.
- Laravel APIs are protected with Sanctum bearer tokens and request validation.
- OTP values are never stored in plain text and each code can be used only once.
- Employee DB credentials should be read-only at the MySQL user level.
