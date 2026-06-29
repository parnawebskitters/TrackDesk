const state = {
  employee: null,
  tasks: [],
  timer: null,
  sync: null,
  activity: [],
  settings: {}
};

const els = {
  loginPanel: document.querySelector('#loginPanel'),
  appPanel: document.querySelector('#appPanel'),
  emailLoginForm: document.querySelector('#emailLoginForm'),
  otpVerifyForm: document.querySelector('#otpVerifyForm'),
  emailLoginMessage: document.querySelector('#emailLoginMessage'),
  otpLoginMessage: document.querySelector('#otpLoginMessage'),
  emailInput: document.querySelector('#emailInput'),
  sendOtpBtn: document.querySelector('#sendOtpBtn'),
  verifyOtpBtn: document.querySelector('#verifyOtpBtn'),
  resendOtpBtn: document.querySelector('#resendOtpBtn'),
  changeEmailBtn: document.querySelector('#changeEmailBtn'),
  otpEmailLabel: document.querySelector('#otpEmailLabel'),
  otpCountdown: document.querySelector('#otpCountdown'),
  otpInputs: Array.from(document.querySelectorAll('.otp-input')),
  employeeName: document.querySelector('#employeeName'),
  employeeMeta: document.querySelector('#employeeMeta'),
  avatar: document.querySelector('#avatar'),
  timerTaskName: document.querySelector('#timerTaskName'),
  timerDisplay: document.querySelector('#timerDisplay'),
  pauseTimerBtn: document.querySelector('#pauseTimerBtn'),
  stopTimerBtn: document.querySelector('#stopTimerBtn'),
  restoreNotice: document.querySelector('#restoreNotice'),
  taskGroups: document.querySelector('#taskGroups'),
  allTasks: document.querySelector('#allTasks'),
  activityList: document.querySelector('#activityList'),
  activeCount: document.querySelector('#activeCount'),
  progressCount: document.querySelector('#progressCount'),
  completedCount: document.querySelector('#completedCount'),
  unsyncedCount: document.querySelector('#unsyncedCount'),
  connectionDot: document.querySelector('#connectionDot'),
  connectionLabel: document.querySelector('#connectionLabel'),
  syncDetail: document.querySelector('#syncDetail'),
  autoLaunchSetting: document.querySelector('#autoLaunchSetting'),
  persistIntervalSetting: document.querySelector('#persistIntervalSetting'),
  syncIntervalSetting: document.querySelector('#syncIntervalSetting'),
  logoutBtn: document.querySelector('#logoutBtn'),
  adminExitForm: document.querySelector('#adminExitForm'),
  adminPasswordInput: document.querySelector('#adminPasswordInput'),
  adminMessage: document.querySelector('#adminMessage')
};

const otpState = {
  email: '',
  expiresAt: 0,
  resendAvailableAt: 0,
  timer: null
};

window.addEventListener('DOMContentLoaded', boot);

async function boot() {
  bindEvents();
  const data = await window.trackDesk.bootstrap();
  Object.assign(state, data);
  render();

  window.trackDesk.timer.onUpdated((timer) => {
    state.timer = timer;
    renderTimer();
  });

  window.trackDesk.sync.onUpdated((sync) => {
    state.sync = sync;
    renderSync();
    renderMetrics();
  });
}

function bindEvents() {
  document.querySelector('#minimizeBtn').addEventListener('click', () => window.trackDesk.window.minimize());
  document.querySelector('#maximizeBtn').addEventListener('click', () => window.trackDesk.window.maximize());

  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => selectView(button.dataset.view));
  });

  els.emailLoginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await requestOtp(false);
  });

  els.otpVerifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (readOtp().length !== 6) {
      els.otpLoginMessage.textContent = 'Enter the 6-digit verification code.';
      els.otpLoginMessage.classList.add('error');
      return;
    }

    await withButtonLoading(els.verifyOtpBtn, async () => {
      const result = await withMessage(els.otpLoginMessage, () => window.trackDesk.auth.verifyOtp({
        email: otpState.email,
        otp: readOtp()
      }));
      state.employee = result.employee;
      state.tasks = result.tasks;
      state.sync = result.sync;
      clearOtpTimer();
      clearOtpInputs();
      render();
    });
  });

  els.resendOtpBtn.addEventListener('click', () => requestOtp(true));
  els.changeEmailBtn.addEventListener('click', showEmailStep);
  els.logoutBtn.addEventListener('click', logout);
  bindOtpInputs();

  document.querySelector('#refreshTasksBtn').addEventListener('click', refreshTasks);
  document.querySelector('#refreshTasksBtnAlt').addEventListener('click', refreshTasks);
  els.pauseTimerBtn.addEventListener('click', pauseTimer);
  els.stopTimerBtn.addEventListener('click', stopTimer);

  els.adminExitForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await withMessage(els.adminMessage, async () => {
      await window.trackDesk.admin.exit(els.adminPasswordInput.value);
      return 'Exiting.';
    });
  });
}

async function requestOtp(isResend) {
  const email = (isResend ? otpState.email : els.emailInput.value).trim();
  if (!isValidEmail(email)) {
    els.emailLoginMessage.textContent = 'Enter a valid company email address.';
    els.emailLoginMessage.classList.add('error');
    return;
  }

  const button = isResend ? els.resendOtpBtn : els.sendOtpBtn;
  const message = isResend ? els.otpLoginMessage : els.emailLoginMessage;
  await withButtonLoading(button, async () => {
    const response = await withMessage(message, () => (
      isResend ? window.trackDesk.auth.resendOtp(email) : window.trackDesk.auth.sendOtp(email)
    ));
    startOtpStep(email, response);
  });
}

function startOtpStep(email, response = {}) {
  otpState.email = email;
  otpState.expiresAt = Date.now() + Number(response.expiresInSeconds || 300) * 1000;
  otpState.resendAvailableAt = Date.now() + Number(response.resendCooldownSeconds || 60) * 1000;
  els.otpEmailLabel.textContent = email;
  els.emailLoginForm.classList.add('hidden');
  els.otpVerifyForm.classList.remove('hidden');
  els.otpLoginMessage.textContent = response.message || 'A verification code has been sent to your email.';
  els.otpLoginMessage.classList.remove('error');
  clearOtpInputs();
  els.otpInputs[0].focus();
  startOtpTimer();
}

function showEmailStep() {
  clearOtpTimer();
  els.otpVerifyForm.classList.add('hidden');
  els.emailLoginForm.classList.remove('hidden');
  els.emailInput.focus();
}

function render() {
  const signedIn = Boolean(state.employee);
  els.loginPanel.classList.toggle('hidden', signedIn);
  els.appPanel.classList.toggle('hidden', !signedIn);
  renderProfile();
  renderTimer();
  renderTasks();
  renderMetrics();
  renderSync();
  renderActivity();
  renderSettings();
}

function bindOtpInputs() {
  els.otpInputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 1);
      if (input.value && els.otpInputs[index + 1]) {
        els.otpInputs[index + 1].focus();
      }
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !input.value && els.otpInputs[index - 1]) {
        els.otpInputs[index - 1].focus();
      }
    });

    input.addEventListener('paste', (event) => {
      event.preventDefault();
      const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      digits.split('').forEach((digit, digitIndex) => {
        if (els.otpInputs[digitIndex]) els.otpInputs[digitIndex].value = digit;
      });
      els.otpInputs[Math.min(digits.length, 5)]?.focus();
    });
  });
}

function startOtpTimer() {
  clearOtpTimer();
  updateOtpTimer();
  otpState.timer = setInterval(updateOtpTimer, 1000);
}

function clearOtpTimer() {
  if (otpState.timer) clearInterval(otpState.timer);
  otpState.timer = null;
}

function updateOtpTimer() {
  const expiresRemaining = Math.max(0, Math.ceil((otpState.expiresAt - Date.now()) / 1000));
  const resendRemaining = Math.max(0, Math.ceil((otpState.resendAvailableAt - Date.now()) / 1000));
  els.otpCountdown.textContent = `Expires in ${formatCountdown(expiresRemaining)}`;
  els.resendOtpBtn.disabled = resendRemaining > 0;
  els.resendOtpBtn.textContent = resendRemaining > 0 ? `Resend in ${resendRemaining}s` : 'Resend OTP';

  if (expiresRemaining === 0) {
    els.otpCountdown.textContent = 'Code expired';
    els.verifyOtpBtn.disabled = true;
  } else {
    els.verifyOtpBtn.disabled = false;
  }
}

function renderProfile() {
  if (!state.employee) {
    els.employeeName.textContent = 'Not signed in';
    els.employeeMeta.textContent = 'Secure desktop tracking';
    els.avatar.textContent = 'TD';
    return;
  }
  els.employeeName.textContent = state.employee.name;
  els.employeeMeta.textContent = [state.employee.designation, state.employee.team].filter(Boolean).join(' • ') || state.employee.email;
  els.avatar.textContent = initials(state.employee.name);
}

function renderTimer() {
  const timer = state.timer || {};
  const task = state.tasks.find((item) => item.id === timer.taskId);
  els.timerTaskName.textContent = task ? task.name : 'No active task';
  els.timerDisplay.textContent = formatDuration(timer.elapsedMs || 0);
  els.pauseTimerBtn.disabled = !timer.taskId;
  els.pauseTimerBtn.textContent = timer.isRunning ? 'Pause' : 'Resume';
  els.stopTimerBtn.disabled = !timer.taskId;
  els.restoreNotice.classList.toggle('hidden', !timer.restoredAfterRestart);
}

function renderTasks() {
  const groups = [
    ['active', 'Active'],
    ['in_progress', 'In Progress'],
    ['completed', 'Completed']
  ];
  els.taskGroups.innerHTML = groups.map(([status, label]) => renderTaskGroup(label, tasksByStatus(status))).join('');
  els.allTasks.innerHTML = state.tasks.map(renderTask).join('') || emptyState('No assigned tasks found.');

  document.querySelectorAll('[data-start-task]').forEach((button) => {
    button.addEventListener('click', () => startTimer(button.dataset.startTask));
  });
}

function renderTaskGroup(label, tasks) {
  return `
    <section class="task-group">
      <h3>${label} <span>${tasks.length}</span></h3>
      <div class="task-list">${tasks.map(renderTask).join('') || emptyState('No tasks in this group.')}</div>
    </section>
  `;
}

function renderTask(task) {
  const active = state.timer?.taskId === task.id;
  const disabled = state.timer?.taskId && !active;
  return `
    <article class="task-card">
      <div>
        <h4>${escapeHtml(String(task.name || '').toUpperCase())}</h4>
        <p>${escapeHtml(formatProjectLine(task))}</p>
      </div>
      <dl>
        <div><dt>Estimate</dt><dd>${formatHours(task.estimatedHours)}</dd></div>
        <div><dt>Due Date</dt><dd>${task.dueDate ? formatDate(task.dueDate) : 'Open'}</dd></div>
        <div><dt>Status</dt><dd>${labelStatus(task.status)}</dd></div>
      </dl>
      <button class="primary-action" data-start-task="${task.id}" ${disabled || task.status === 'completed' ? 'disabled' : ''}>
        ${active ? 'Running' : 'Start'}
      </button>
    </article>
  `;
}

function renderMetrics() {
  els.activeCount.textContent = tasksByStatus('active').length;
  els.progressCount.textContent = tasksByStatus('in_progress').length;
  els.completedCount.textContent = tasksByStatus('completed').length;
  els.unsyncedCount.textContent = state.sync?.unsyncedCount || 0;
}

function renderSync() {
  const sync = state.sync || {};
  els.connectionDot.classList.toggle('online', Boolean(sync.online));
  els.connectionLabel.textContent = sync.online ? 'Online' : 'Offline mode';
  if (sync.syncing) {
    els.syncDetail.textContent = 'Synchronizing records';
  } else if (sync.lastSyncedAt) {
    els.syncDetail.textContent = `Last sync ${formatTime(sync.lastSyncedAt)}`;
  } else if (sync.lastError) {
    els.syncDetail.textContent = sync.lastError;
  } else {
    els.syncDetail.textContent = 'Waiting for first sync';
  }
}

function renderActivity() {
  els.activityList.innerHTML = state.activity.map((item) => `
    <article class="activity-item">
      <strong>${escapeHtml(item.taskName || item.taskId)}</strong>
      <span>${formatDuration(item.durationMs)} · ${labelStatus(item.syncStatus)}</span>
      <time>${formatTime(item.stoppedAt)}</time>
    </article>
  `).join('') || emptyState('Completed work sessions will appear here.');
}

function renderSettings() {
  els.autoLaunchSetting.textContent = state.settings.autoLaunchEnabled ? 'Enabled' : 'Enabled on Windows builds';
  els.persistIntervalSetting.textContent = `${state.settings.timerPersistIntervalSeconds || 5} seconds`;
  els.syncIntervalSetting.textContent = `${state.settings.syncIntervalSeconds || 60} seconds`;
}

async function refreshTasks() {
  try {
    const result = await window.trackDesk.tasks.refresh();
    state.tasks = result.tasks;
    renderTasks();
    renderMetrics();
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      await resetToLogin();
    } else {
      throw error;
    }
  }
}

async function logout() {
  await window.trackDesk.auth.logout();
  await resetToLogin();
}

async function resetToLogin() {
  clearOtpTimer();
  clearOtpInputs();
  Object.assign(state, {
    employee: null,
    tasks: [],
    timer: null,
    sync: null,
    activity: []
  });
  els.otpVerifyForm.classList.add('hidden');
  els.emailLoginForm.classList.remove('hidden');
  els.emailLoginMessage.textContent = '';
  els.otpLoginMessage.textContent = '';
  render();
  els.emailInput.focus();
}

async function startTimer(taskId) {
  state.timer = await window.trackDesk.timer.start(taskId);
  await refreshTasks();
  renderTimer();
}

async function pauseTimer() {
  if (state.timer?.isRunning) {
    state.timer = await window.trackDesk.timer.pause();
  } else if (state.timer?.taskId) {
    state.timer = await window.trackDesk.timer.start(state.timer.taskId);
  }
  renderTimer();
}

async function stopTimer() {
  const result = await window.trackDesk.timer.stop();
  state.timer = result.timer;
  state.tasks = result.tasks;
  state.activity = result.activity;
  state.sync = result.sync;
  render();
  if (result.message) {
    els.syncDetail.textContent = result.message;
  }
}

function selectView(viewName) {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewName);
  });
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === `${viewName}View`);
  });
}

async function withMessage(element, fn) {
  element.textContent = '';
  try {
    const result = await fn();
    const message = typeof result === 'string' ? result : result?.message;
    element.textContent = message || '';
    element.classList.remove('error');
    return result;
  } catch (error) {
    element.textContent = error.message;
    element.classList.add('error');
    throw error;
  }
}

async function withButtonLoading(button, fn) {
  const text = button.textContent;
  button.disabled = true;
  button.textContent = 'Please wait';
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.textContent = text;
    updateOtpTimer();
  }
}

function readOtp() {
  return els.otpInputs.map((input) => input.value).join('');
}

function clearOtpInputs() {
  els.otpInputs.forEach((input) => {
    input.value = '';
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function tasksByStatus(status) {
  return state.tasks.filter((task) => task.status === status);
}

function formatDuration(ms = 0) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatHours(value = 0) {
  const hours = Number(value || 0);
  const formatted = Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
  return `${formatted} ${hours === 1 ? 'Hour' : 'Hours'}`;
}

function formatProjectLine(task) {
  const uniqueId = task.projectUniqueId ? ` (${task.projectUniqueId})` : '';
  return `${task.projectName || 'Unassigned project'}${uniqueId}`;
}

function formatTime(value) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function labelStatus(value = '') {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'TD';
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}
