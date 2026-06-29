const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const { DEFAULTS } = require('./config');
const { LocalDatabase } = require('./services/database');
const { ApiClient } = require('./services/apiClient');
const { AuthService } = require('./services/authService');
const { TaskService } = require('./services/taskService');
const { TimerService } = require('./services/timerService');
const { SyncService } = require('./services/syncService');
const log = require('./services/logger');

let mainWindow;
let tray;
let db;
let apiClient;
let authService;
let taskService;
let timerService;
let syncService;
let allowQuit = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  db = await new LocalDatabase().open();
  apiClient = new ApiClient(DEFAULTS, () => authService?.getToken());
  authService = new AuthService(db, apiClient);
  taskService = new TaskService(db, apiClient);
  timerService = new TimerService(db, taskService, apiClient, {
    persistIntervalSeconds: DEFAULTS.timerPersistIntervalSeconds
  });
  syncService = new SyncService(db, apiClient, taskService, {
    intervalSeconds: DEFAULTS.syncIntervalSeconds
  });

  await authService.initialize();
  createWindow();
  createTray();
  setupIpc();
  setupEvents();
  setupAutoLaunch();
  timerService.restore();

  const employee = authService.getCachedEmployee();
  if (employee) {
    syncService.start(employee.id);
  }

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    log.warn('Auto update check failed', error.message);
  });
});

app.on('before-quit', (event) => {
  if (!allowQuit) {
    event.preventDefault();
    if (mainWindow) mainWindow.hide();
    return;
  }
  timerService?.persistElapsed();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    frame: false,
    show: false,
    backgroundColor: '#f7f8fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (event) => {
    if (!allowQuit) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('TrackDesk is running');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show TrackDesk', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Admin exit required from Settings', enabled: false }
  ]));
  tray.on('click', () => mainWindow?.show());
}

function setupAutoLaunch() {
  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: app.getPath('exe')
    });
  }
}

function setupEvents() {
  timerService.on('updated', (state) => {
    mainWindow?.webContents.send('timer:updated', state);
  });

  syncService.on('updated', (status) => {
    mainWindow?.webContents.send('sync:updated', status);
  });

  app.on('browser-window-blur', () => {
    timerService.persistElapsed();
  });
}

function setupIpc() {
  ipcMain.handle('app:bootstrap', async () => {
    const employee = authService.getCachedEmployee();
    const tasks = employee ? taskService.listTasks(employee.id) : [];
    const activity = employee ? db.listRecentActivity(employee.id) : [];
    return {
      employee,
      tasks,
      timer: timerService.getState(),
      sync: syncService.getStatus(),
      activity,
      settings: {
        syncIntervalSeconds: DEFAULTS.syncIntervalSeconds,
        timerPersistIntervalSeconds: DEFAULTS.timerPersistIntervalSeconds,
        autoLaunchEnabled: process.platform === 'win32' ? app.getLoginItemSettings().openAtLogin : false
      }
    };
  });

  ipcMain.handle('window:minimize', () => mainWindow.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('window:hide', () => mainWindow.hide());

  ipcMain.handle('auth:send-otp', (_event, email) => authService.requestOtp(email));
  ipcMain.handle('auth:resend-otp', (_event, email) => authService.resendOtp(email));

  ipcMain.handle('auth:verify-otp', async (_event, payload) => {
    const result = await authService.verifyOtp(payload);
    const taskResult = await taskService.refreshTasks(result.employee.id);
    syncService.start(result.employee.id);
    return {
      ...result,
      tasks: taskResult.tasks,
      sync: syncService.getStatus()
    };
  });

  ipcMain.handle('auth:logout', async () => {
    timerService.persistElapsed();
    syncService.stop();
    await authService.logout();
    return true;
  });

  ipcMain.handle('tasks:refresh', async () => {
    const employee = authService.getCachedEmployee();
    if (!employee) throw new Error('Please sign in first.');
    const result = await taskService.refreshTasks(employee.id);
    return result;
  });

  ipcMain.handle('timer:start', async (_event, taskId) => {
    const employee = authService.getCachedEmployee();
    if (!employee) throw new Error('Please sign in first.');
    return timerService.start(employee.id, taskId);
  });

  ipcMain.handle('timer:pause', () => timerService.pause());
  ipcMain.handle('timer:stop', async () => {
    const result = await timerService.stop();
    const sync = await syncService.sync();
    const employee = authService.getCachedEmployee();
    return {
      timer: result,
      tasks: employee ? taskService.listTasks(employee.id) : [],
      activity: employee ? db.listRecentActivity(employee.id) : [],
      sync,
      message: sync.lastError ? 'Task completed locally. Sync pending.' : 'Task completed successfully.'
    };
  });

  ipcMain.handle('sync:run', () => syncService.sync());

  ipcMain.handle('admin:exit', (_event, password) => {
    if (password !== DEFAULTS.adminExitPassword) {
      throw new Error('Invalid administrator password.');
    }
    allowQuit = true;
    timerService.persistElapsed();
    app.quit();
    return true;
  });
}
