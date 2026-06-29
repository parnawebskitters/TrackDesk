const log = require('electron-log/main');

log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = process.env.ELECTRON_ENABLE_LOGGING ? 'debug' : 'warn';

module.exports = log;
