const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const initSqlJs = require('sql.js');
const { randomUUID } = require('node:crypto');
const log = require('./logger');

class LocalDatabase {
  constructor() {
    this.db = null;
    this.filePath = null;
    this.inTransaction = false;
  }

  async open() {
    const SQL = await initSqlJs({
      locateFile: (file) => require.resolve(`sql.js/dist/${file}`)
    });
    this.filePath = path.join(app.getPath('userData'), 'trackdesk.sqlite3');
    if (fs.existsSync(this.filePath)) {
      this.db = new SQL.Database(fs.readFileSync(this.filePath));
    } else {
      this.db = new SQL.Database();
    }
    this.migrate();
    this.persist();
    return this;
  }

  migrate() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        department TEXT,
        designation TEXT,
        team TEXT,
        status TEXT,
        cached_at TEXT NOT NULL
      );

      CREATE VIEW IF NOT EXISTS employee AS SELECT * FROM employees;

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        name TEXT NOT NULL,
        project_name TEXT NOT NULL,
        project_unique_id TEXT,
        client_name TEXT NOT NULL,
        estimated_hours REAL DEFAULT 0,
        due_date TEXT,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT
      );

      CREATE TABLE IF NOT EXISTS timer_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        employee_id TEXT,
        task_id TEXT,
        started_at TEXT,
        elapsed_ms INTEGER NOT NULL DEFAULT 0,
        is_running INTEGER NOT NULL DEFAULT 0,
        restored_after_restart INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE VIEW IF NOT EXISTS running_timer AS SELECT * FROM timer_state;

      CREATE TABLE IF NOT EXISTS timer_sessions (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        stopped_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        sync_status TEXT NOT NULL,
        server_id TEXT,
        created_at TEXT NOT NULL,
        synced_at TEXT
      );

      CREATE VIEW IF NOT EXISTS work_sessions AS SELECT * FROM timer_sessions;

      CREATE TABLE IF NOT EXISTS pending_requests (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE VIEW IF NOT EXISTS sync_queue AS SELECT * FROM pending_requests;
      CREATE VIEW IF NOT EXISTS application_settings AS SELECT * FROM settings;

      CREATE INDEX IF NOT EXISTS idx_tasks_employee_status ON tasks(employee_id, status);
      CREATE INDEX IF NOT EXISTS idx_sessions_sync_status ON timer_sessions(sync_status);
      CREATE INDEX IF NOT EXISTS idx_pending_created ON pending_requests(created_at);
    `);
    this.addColumnIfMissing('tasks', 'project_unique_id', 'TEXT');
    this.removeLegacySampleData();
    this.removeOrphanedUploadRequests();
  }

  addColumnIfMissing(table, column, definition) {
    const columns = this.all(`PRAGMA table_info(${table})`).map((row) => row.name);
    if (!columns.includes(column)) {
      this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  removeLegacySampleData() {
    this.db.run("DELETE FROM pending_requests WHERE idempotency_key IN (SELECT id FROM timer_sessions WHERE task_id LIKE 'sample-%')");
    this.db.run("DELETE FROM timer_sessions WHERE task_id LIKE 'sample-%'");
    this.db.run("DELETE FROM timer_state WHERE task_id LIKE 'sample-%'");
    this.db.run("DELETE FROM tasks WHERE id LIKE 'sample-%'");
  }

  removeOrphanedUploadRequests() {
    this.db.run(`
      DELETE FROM pending_requests
      WHERE type = 'upload_time_session'
        AND idempotency_key NOT IN (
          SELECT id FROM timer_sessions WHERE sync_status IN ('pending', 'failed')
        )
    `);
  }

  now() {
    return new Date().toISOString();
  }

  persist() {
    const tmpPath = `${this.filePath}.tmp`;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(tmpPath, Buffer.from(this.db.export()));
    fs.renameSync(tmpPath, this.filePath);
  }

  transaction(fn) {
    this.db.run('BEGIN TRANSACTION');
    this.inTransaction = true;
    try {
      const result = fn();
      this.db.run('COMMIT');
      this.inTransaction = false;
      this.persist();
      return result;
    } catch (error) {
      this.db.run('ROLLBACK');
      this.inTransaction = false;
      throw error;
    }
  }

  run(sql, params = []) {
    this.db.run(sql, params);
    if (!this.inTransaction) this.persist();
  }

  runMany(statements) {
    this.transaction(() => {
      for (const [sql, params] of statements) {
        this.db.run(sql, params);
      }
    });
  }

  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      if (!stmt.step()) return null;
      return stmt.getAsObject();
    } finally {
      stmt.free();
    }
  }

  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    const rows = [];
    try {
      stmt.bind(params);
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  setSetting(key, value) {
    this.run(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `, [key, JSON.stringify(value), this.now()]);
  }

  getSetting(key, fallback = null) {
    const row = this.get('SELECT value FROM settings WHERE key = ?', [key]);
    if (!row) return fallback;
    try {
      return JSON.parse(row.value);
    } catch (error) {
      log.warn('Corrupted setting, using fallback', key, error);
      return fallback;
    }
  }

  saveEmployee(employee) {
    this.run(`
      INSERT INTO employees (id, name, email, department, designation, team, status, cached_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        department = excluded.department,
        designation = excluded.designation,
        team = excluded.team,
        status = excluded.status,
        cached_at = excluded.cached_at
    `, [
      employee.id,
      employee.name,
      employee.email,
      employee.department,
      employee.designation,
      employee.team,
      employee.status,
      this.now()
    ]);
  }

  getEmployee(id) {
    if (!id) return null;
    return this.get('SELECT * FROM employees WHERE id = ?', [id]);
  }

  getLastEmployee() {
    return this.get('SELECT * FROM employees ORDER BY cached_at DESC LIMIT 1');
  }

  upsertTasks(employeeId, tasks) {
    const now = this.now();
    this.runMany(tasks.map((task) => [`
      INSERT INTO tasks (id, employee_id, name, project_name, project_unique_id, client_name, estimated_hours, due_date, status, updated_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        project_name = excluded.project_name,
        project_unique_id = excluded.project_unique_id,
        client_name = excluded.client_name,
        estimated_hours = excluded.estimated_hours,
        due_date = excluded.due_date,
        status = excluded.status,
        updated_at = excluded.updated_at,
        synced_at = excluded.synced_at
    `, [
      task.id,
      employeeId,
      task.name,
      task.projectName,
      task.projectUniqueId || null,
      task.clientName,
      task.estimatedHours || 0,
      task.dueDate || null,
      task.status || 'active',
      task.updatedAt || now,
      now
    ]]));
  }

  listTasks(employeeId) {
    return this.all(`
      SELECT
        id,
        employee_id AS employeeId,
        name,
        project_name AS projectName,
        project_unique_id AS projectUniqueId,
        client_name AS clientName,
        estimated_hours AS estimatedHours,
        due_date AS dueDate,
        status,
        updated_at AS updatedAt,
        synced_at AS syncedAt
      FROM tasks
      WHERE employee_id = ?
      ORDER BY
        CASE status WHEN 'active' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
        due_date IS NULL,
        due_date ASC
    `, [employeeId]);
  }

  updateTaskStatus(taskId, status) {
    this.run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [status, this.now(), taskId]);
  }

  saveTimerState(state) {
    this.run(`
      INSERT INTO timer_state (id, employee_id, task_id, started_at, elapsed_ms, is_running, restored_after_restart, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        employee_id = excluded.employee_id,
        task_id = excluded.task_id,
        started_at = excluded.started_at,
        elapsed_ms = excluded.elapsed_ms,
        is_running = excluded.is_running,
        restored_after_restart = excluded.restored_after_restart,
        updated_at = excluded.updated_at
    `, [
      state.employeeId || null,
      state.taskId || null,
      state.startedAt || null,
      Math.max(0, Math.round(state.elapsedMs || 0)),
      state.isRunning ? 1 : 0,
      state.restoredAfterRestart ? 1 : 0,
      this.now()
    ]);
  }

  getTimerState() {
    const row = this.get(`
      SELECT employee_id AS employeeId, task_id AS taskId, started_at AS startedAt,
        elapsed_ms AS elapsedMs, is_running AS isRunning,
        restored_after_restart AS restoredAfterRestart, updated_at AS updatedAt
      FROM timer_state WHERE id = 1
    `);
    if (!row) return null;
    return {
      ...row,
      isRunning: Boolean(row.isRunning),
      restoredAfterRestart: Boolean(row.restoredAfterRestart)
    };
  }

  clearTimerState() {
    this.saveTimerState({ elapsedMs: 0, isRunning: false, restoredAfterRestart: false });
  }

  createTimerSession(session) {
    const id = session.id || randomUUID();
    this.run(`
      INSERT INTO timer_sessions (id, employee_id, task_id, started_at, stopped_at, duration_ms, sync_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `, [id, session.employeeId, session.taskId, session.startedAt, session.stoppedAt, session.durationMs, this.now()]);
    return id;
  }

  listPendingSessions(limit = 25) {
    return this.all(`
      SELECT id, employee_id AS employeeId, task_id AS taskId, started_at AS startedAt,
        stopped_at AS stoppedAt, duration_ms AS durationMs, created_at AS createdAt
      FROM timer_sessions
      WHERE sync_status IN ('pending', 'failed')
      ORDER BY created_at ASC
      LIMIT ?
    `, [limit]);
  }

  markSessionSynced(id, serverId) {
    this.transaction(() => {
      this.db.run(`
        UPDATE timer_sessions
        SET sync_status = 'synced', server_id = ?, synced_at = ?
        WHERE id = ?
      `, [serverId || null, this.now(), id]);
      this.db.run('DELETE FROM pending_requests WHERE type = ? AND idempotency_key = ?', ['upload_time_session', id]);
    });
  }

  markSessionFailed(id, _error) {
    this.run('UPDATE timer_sessions SET sync_status = ? WHERE id = ?', ['failed', id]);
  }

  discardSession(id, reason) {
    log.warn('Discarding local time session', id, reason);
    this.transaction(() => {
      this.db.run('DELETE FROM pending_requests WHERE idempotency_key = ?', [id]);
      this.db.run('DELETE FROM timer_sessions WHERE id = ?', [id]);
    });
  }

  queueRequest(type, payload, idempotencyKey = randomUUID()) {
    const now = this.now();
    this.run(`
      INSERT INTO pending_requests (id, type, payload, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(idempotency_key) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `, [randomUUID(), type, JSON.stringify(payload), idempotencyKey, now, now]);
  }

  listPendingRequests(type, limit = 25) {
    return this.all(`
      SELECT id, type, payload, idempotency_key AS idempotencyKey, attempts, created_at AS createdAt
      FROM pending_requests
      WHERE type = ?
      ORDER BY created_at ASC
      LIMIT ?
    `, [type, limit]).map((row) => ({
      ...row,
      payload: JSON.parse(row.payload)
    }));
  }

  deletePendingRequest(id) {
    this.run('DELETE FROM pending_requests WHERE id = ?', [id]);
  }

  markPendingRequestFailed(id, error) {
    this.run(`
      UPDATE pending_requests
      SET attempts = attempts + 1, last_error = ?, updated_at = ?
      WHERE id = ?
    `, [String(error), this.now(), id]);
  }

  countUnsynced() {
    const row = this.get(`
      SELECT
        (SELECT COUNT(*) FROM timer_sessions WHERE sync_status IN ('pending', 'failed')) +
        (SELECT COUNT(*) FROM pending_requests WHERE type != 'upload_time_session') AS total
    `);
    return row?.total || 0;
  }

  listRecentActivity(employeeId, limit = 12) {
    return this.all(`
      SELECT s.id, s.task_id AS taskId, t.name AS taskName, s.started_at AS startedAt,
        s.stopped_at AS stoppedAt, s.duration_ms AS durationMs, s.sync_status AS syncStatus
      FROM timer_sessions s
      LEFT JOIN tasks t ON t.id = s.task_id
      WHERE s.employee_id = ?
      ORDER BY s.created_at DESC
      LIMIT ?
    `, [employeeId, limit]);
  }
}

module.exports = { LocalDatabase };
