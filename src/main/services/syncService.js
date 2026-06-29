const { EventEmitter } = require('node:events');
const log = require('./logger');

class SyncService extends EventEmitter {
  constructor(db, apiClient, taskService, options) {
    super();
    this.db = db;
    this.apiClient = apiClient;
    this.taskService = taskService;
    this.intervalMs = Math.max(15000, options.intervalSeconds * 1000);
    this.employeeId = null;
    this.handle = null;
    this.running = false;
    this.status = {
      online: false,
      syncing: false,
      unsyncedCount: 0,
      lastSyncedAt: null,
      lastError: null
    };
  }

  start(employeeId) {
    this.employeeId = employeeId;
    this.stop();
    this.handle = setInterval(() => this.sync(), this.intervalMs);
    this.sync();
  }

  stop() {
    if (this.handle) clearInterval(this.handle);
    this.handle = null;
  }

  getStatus() {
    return { ...this.status, unsyncedCount: this.db.countUnsynced() };
  }

  async sync() {
    if (this.running || !this.employeeId) return this.getStatus();
    this.running = true;
    this.updateStatus({ syncing: true, lastError: null, unsyncedCount: this.db.countUnsynced() });

    try {
      await this.pushTimerEvents();
      await this.pushSessions();
      const taskRefresh = await this.taskService.refreshTasks(this.employeeId);
      if (taskRefresh.offline) {
        throw new Error(taskRefresh.warning || 'Task server is unavailable.');
      }

      this.updateStatus({
        online: true,
        syncing: false,
        lastSyncedAt: new Date().toISOString(),
        unsyncedCount: this.db.countUnsynced()
      });
    } catch (error) {
      log.warn('Sync failed', error.message);
      this.updateStatus({
        online: this.isApiResponseError(error),
        syncing: false,
        lastError: error.message,
        unsyncedCount: this.db.countUnsynced()
      });
    } finally {
      this.running = false;
    }
    return this.getStatus();
  }

  async pushSessions() {
    const sessions = this.db.listPendingSessions();
    for (const session of sessions) {
      try {
        if (!Number.isInteger(Number(session.taskId))) {
          this.db.discardSession(session.id, `Discarded legacy non-numeric task id: ${session.taskId}`);
          continue;
        }

        const response = await this.apiClient.uploadTimeSession(session);
        const uploaded = response?.sessions?.[0] || response;
        this.db.markSessionSynced(session.id, uploaded?.id || uploaded?.serverId);
      } catch (error) {
        this.db.markSessionFailed(session.id, error.message);
        throw error;
      }
    }
  }

  async pushTimerEvents() {
    const events = this.db.listPendingRequests('timer_event');
    for (const event of events) {
      try {
        await this.replayTimerEvent(event.payload);
        this.db.deletePendingRequest(event.id);
      } catch (error) {
        if (this.isStaleTimerEventError(error)) {
          log.warn('Discarding stale timer event', error.message);
          this.db.deletePendingRequest(event.id);
          continue;
        }
        this.db.markPendingRequestFailed(event.id, error.message);
        throw error;
      }
    }
  }

  async replayTimerEvent({ action, payload }) {
    if (action === 'start') {
      await this.apiClient.startTimer(payload.taskId, payload.startedAt, payload.elapsedMs);
      return;
    }
    if (action === 'pause') {
      await this.apiClient.pauseTimer(payload.taskId, payload.startedAt, payload.stoppedAt, payload.elapsedMs);
      return;
    }
    if (action === 'resume') {
      await this.apiClient.resumeTimer(payload.taskId, payload.startedAt, payload.elapsedMs);
      return;
    }
    throw new Error(`Unsupported timer event: ${action}`);
  }

  isApiResponseError(error) {
    return Number.isInteger(error.status) && error.status < 500;
  }

  isStaleTimerEventError(error) {
    if (error.status && error.status !== 422) return false;
    return [
      'No running timer session was found for this task.',
      'A timer is already running for this employee.',
      'This task cannot be resumed because its latest timer session is not paused.'
    ].some((message) => error.message.includes(message));
  }

  updateStatus(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('updated', this.getStatus());
  }
}

module.exports = { SyncService };
