const { randomUUID } = require('node:crypto');
const { URL } = require('node:url');

async function fetchJson(url, options = {}) {
  const { default: fetch } = await import('node-fetch');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 15000);

  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
  } catch (error) {
    const friendly = new Error(`Could not reach the TrackDesk API at ${new URL(url).origin}. Check LARAVEL_API_BASE_URL in .env and make sure the Laravel API is running.`);
    friendly.cause = error;
    throw friendly;
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const validationMessage = body?.errors ? Object.values(body.errors).flat()[0] : null;
    const error = new Error(validationMessage || body?.message || `Request failed with ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

class ApiClient {
  constructor({ apiBaseUrl, apiTimeoutMs }, tokenProvider) {
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
    this.apiTimeoutMs = apiTimeoutMs;
    this.tokenProvider = tokenProvider;
  }

  async sendOtp(email) {
    return fetchJson(`${this.apiBaseUrl}/auth/send-otp`, {
      method: 'POST',
      body: JSON.stringify({ email, device_name: 'TrackDesk Desktop' }),
      timeoutMs: this.apiTimeoutMs
    });
  }

  async resendOtp(email) {
    return fetchJson(`${this.apiBaseUrl}/auth/resend-otp`, {
      method: 'POST',
      body: JSON.stringify({ email, device_name: 'TrackDesk Desktop' }),
      timeoutMs: this.apiTimeoutMs
    });
  }

  async verifyOtp(email, otp) {
    return fetchJson(`${this.apiBaseUrl}/auth/verify-otp`, {
      method: 'POST',
      body: JSON.stringify({ email, otp, device_name: 'TrackDesk Desktop' }),
      timeoutMs: this.apiTimeoutMs
    });
  }

  async refreshToken() {
    return this.post(`${this.apiBaseUrl}/auth/refresh`, { device_name: 'TrackDesk Desktop' });
  }

  async logout() {
    return this.post(`${this.apiBaseUrl}/auth/logout`, {});
  }

  async fetchCurrentEmployee() {
    return this.get(`${this.apiBaseUrl}/auth/me`);
  }

  async fetchAssignedTasks() {
    return this.get(`${this.apiBaseUrl}/tasks`);
  }

  async fetchTask(taskId) {
    return this.get(`${this.apiBaseUrl}/tasks/${taskId}`);
  }

  async startTimer(taskId, startedAt, elapsedMs = 0) {
    return this.post(`${this.apiBaseUrl}/time/timer/start`, {
      task_id: toIntegerId(taskId),
      started_at: toLaravelDateTime(startedAt),
      elapsed_ms: elapsedMs
    });
  }

  async pauseTimer(taskId, startedAt, stoppedAt, elapsedMs = 0) {
    return this.post(`${this.apiBaseUrl}/time/timer/pause`, {
      task_id: toIntegerId(taskId),
      started_at: toLaravelDateTime(startedAt),
      stopped_at: toLaravelDateTime(stoppedAt),
      elapsed_ms: elapsedMs
    });
  }

  async resumeTimer(taskId, startedAt, elapsedMs = 0) {
    return this.post(`${this.apiBaseUrl}/time/timer/resume`, {
      task_id: toIntegerId(taskId),
      started_at: toLaravelDateTime(startedAt),
      elapsed_ms: elapsedMs
    });
  }

  async stopTimer(session) {
    const syncId = session.id || randomUUID();
    return this.post(`${this.apiBaseUrl}/time/timer/stop`, toLaravelSessionPayload(session, syncId), {
      'Idempotency-Key': syncId
    });
  }

  async uploadTimeSession(session) {
    const syncId = session.id || randomUUID();
    return this.post(`${this.apiBaseUrl}/sync/offline-entries`, {
      entries: [toLaravelSessionPayload(session, syncId)]
    }, {
      'Idempotency-Key': syncId
    });
  }

  async updateTaskStatus(taskId, status) {
    return this.patch(`${this.apiBaseUrl}/tasks/${taskId}/status`, { status });
  }

  async downloadSyncTasks() {
    return this.get(`${this.apiBaseUrl}/sync/tasks`);
  }

  async get(url) {
    return fetchJson(url, { headers: await this.authHeaders(), timeoutMs: this.apiTimeoutMs });
  }

  async post(url, body, headers = {}) {
    return fetchJson(url, {
      method: 'POST',
      headers: { ...(await this.authHeaders()), ...headers },
      body: JSON.stringify(body),
      timeoutMs: this.apiTimeoutMs
    });
  }

  async patch(url, body) {
    return fetchJson(url, {
      method: 'PATCH',
      headers: await this.authHeaders(),
      body: JSON.stringify(body),
      timeoutMs: this.apiTimeoutMs
    });
  }

  async authHeaders() {
    const token = await this.tokenProvider();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}

function toLaravelSessionPayload(session, syncId) {
  return {
    sync_id: syncId,
    task_id: toIntegerId(session.taskId),
    started_at: toLaravelDateTime(session.startedAt),
    stopped_at: toLaravelDateTime(session.stoppedAt),
    duration_ms: session.durationMs,
    metadata: {
      local_created_at: session.createdAt,
      source: 'trackdesk-electron'
    }
  };
}

function toLaravelDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timer timestamp: ${value}`);
  }

  const pad = (part) => String(part).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + ' ' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join(':');
}

function toIntegerId(value) {
  const id = Number(value);
  if (!Number.isInteger(id)) {
    throw new Error(`Invalid numeric task id: ${value}`);
  }
  return id;
}

module.exports = { ApiClient };
