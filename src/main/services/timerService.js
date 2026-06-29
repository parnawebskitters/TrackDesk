const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');

class TimerService extends EventEmitter {
  constructor(db, taskService, apiClient, options) {
    super();
    this.db = db;
    this.taskService = taskService;
    this.apiClient = apiClient;
    this.persistIntervalMs = Math.max(1000, options.persistIntervalSeconds * 1000);
    this.tickHandle = null;
    this.persistHandle = null;
    this.state = {
      employeeId: null,
      taskId: null,
      startedAt: null,
      elapsedMs: 0,
      isRunning: false,
      restoredAfterRestart: false
    };
  }

  restore() {
    const saved = this.db.getTimerState();
    if (saved?.isRunning && saved.taskId) {
      this.state = {
        ...saved,
        startedAt: saved.startedAt || new Date().toISOString(),
        restoredAfterRestart: true
      };
      this.db.saveTimerState(this.state);
      this.startLoops();
    } else if (saved) {
      this.state = saved;
    }
    return this.getState();
  }

  async start(employeeId, taskId) {
    if (this.state.isRunning && this.state.taskId !== taskId) {
      throw new Error('Stop the current task before starting another timer.');
    }

    if (!this.state.isRunning) {
      const startedAt = new Date().toISOString();
      const elapsedMs = this.state.taskId === taskId ? this.state.elapsedMs : 0;
      if (this.state.taskId === taskId && elapsedMs > 0) {
        await this.tryRemoteTimerUpdate('resume', { taskId, startedAt, elapsedMs }, () => this.apiClient.resumeTimer(taskId, startedAt, elapsedMs));
      } else {
        await this.tryRemoteTimerUpdate('start', { taskId, startedAt, elapsedMs }, () => this.apiClient.startTimer(taskId, startedAt, elapsedMs));
      }

      this.state = {
        employeeId,
        taskId,
        startedAt,
        elapsedMs,
        isRunning: true,
        restoredAfterRestart: false
      };
      this.taskService.markInProgress(taskId);
      this.db.saveTimerState(this.state);
      this.startLoops();
      this.emitUpdate();
    }
    return this.getState();
  }

  async pause() {
    if (!this.state.isRunning) return this.getState();
    this.persistElapsed();
    const stoppedAt = new Date().toISOString();
    await this.tryRemoteTimerUpdate('pause', {
      taskId: this.state.taskId,
      startedAt: this.state.startedAt,
      stoppedAt,
      elapsedMs: this.state.elapsedMs
    }, () => this.apiClient.pauseTimer(this.state.taskId, this.state.startedAt, stoppedAt, this.state.elapsedMs));
    this.state.isRunning = false;
    this.state.restoredAfterRestart = false;
    this.db.saveTimerState(this.state);
    this.stopLoops();
    this.emitUpdate();
    return this.getState();
  }

  async tryRemoteTimerUpdate(action, payload, fn) {
    try {
      await fn();
    } catch (error) {
      this.db.queueRequest('timer_event', { action, payload, error: error.message });
    }
  }

  async stop() {
    if (!this.state.taskId) return this.getState();
    this.persistElapsed();
    const stoppedAt = new Date().toISOString();
    const session = {
      id: randomUUID(),
      employeeId: this.state.employeeId,
      taskId: this.state.taskId,
      startedAt: this.state.startedAt,
      stoppedAt,
      durationMs: this.state.elapsedMs
    };
    let uploaded = null;

    if (session.durationMs > 0) {
      try {
        const response = await this.apiClient.stopTimer(session);
        uploaded = response?.session || response;
      } catch {
        uploaded = null;
      }
    }

    this.db.transaction(() => {
      if (session.durationMs > 0) {
        this.db.createTimerSession(session);
        if (uploaded) {
          this.db.markSessionSynced(session.id, uploaded.id || uploaded.serverId);
        }
      }
      this.db.clearTimerState();
      this.db.updateTaskStatus(session.taskId, 'completed');
    });

    this.state = {
      employeeId: session.employeeId,
      taskId: null,
      startedAt: null,
      elapsedMs: 0,
      isRunning: false,
      restoredAfterRestart: false
    };
    this.stopLoops();
    this.emitUpdate();
    return { ...this.getState(), completedSession: session };
  }

  getState() {
    return {
      ...this.state,
      elapsedMs: this.currentElapsedMs()
    };
  }

  currentElapsedMs() {
    if (!this.state.isRunning || !this.state.lastTickAt) return this.state.elapsedMs;
    return this.state.elapsedMs + (Date.now() - this.state.lastTickAt);
  }

  persistElapsed() {
    if (this.state.isRunning && this.state.lastTickAt) {
      this.state.elapsedMs += Date.now() - this.state.lastTickAt;
      this.state.lastTickAt = Date.now();
    }
    this.db.saveTimerState(this.state);
  }

  startLoops() {
    this.stopLoops();
    this.state.lastTickAt = Date.now();
    this.tickHandle = setInterval(() => this.emitUpdate(), 1000);
    this.persistHandle = setInterval(() => {
      this.persistElapsed();
      this.emitUpdate();
    }, this.persistIntervalMs);
  }

  stopLoops() {
    if (this.tickHandle) clearInterval(this.tickHandle);
    if (this.persistHandle) clearInterval(this.persistHandle);
    this.tickHandle = null;
    this.persistHandle = null;
    delete this.state.lastTickAt;
  }

  emitUpdate() {
    this.emit('updated', this.getState());
  }
}

module.exports = { TimerService };
