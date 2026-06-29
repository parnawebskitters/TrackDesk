const { safeStorage } = require('electron');
const log = require('./logger');

class AuthService {
  constructor(db, apiClient) {
    this.db = db;
    this.apiClient = apiClient;
    this.currentToken = null;
    this.currentEmployee = null;
  }

  async initialize() {
    this.currentToken = await this.loadToken();
    if (!this.currentToken) {
      this.currentEmployee = null;
      this.db.setSetting('lastEmployeeId', null);
      return null;
    }

    try {
      const response = await this.apiClient.fetchCurrentEmployee();
      const employee = normalizeEmployee(response.employee);
      this.db.saveEmployee(employee);
      this.db.setSetting('lastEmployeeId', employee.id);
      this.currentEmployee = employee;
      return employee;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        log.warn('Stored authentication token is no longer valid', error.message);
        await this.clearLocalSession();
        return null;
      }
      log.warn('Session validation unavailable, using cached employee', error.message);
      this.currentEmployee = this.getCachedEmployee();
      return this.currentEmployee;
    }
  }

  async requestOtp(email) {
    return this.apiClient.sendOtp(email);
  }

  async resendOtp(email) {
    return this.apiClient.resendOtp(email);
  }

  async verifyOtp({ email, otp }) {
    const response = await this.apiClient.verifyOtp(email, otp);
    const employee = normalizeEmployee(response.employee);
    await this.saveToken(response.accessToken);
    this.db.saveEmployee(employee);
    this.db.setSetting('lastEmployeeId', employee.id);
    this.currentEmployee = employee;
    return { employee, offline: false };
  }

  async logout() {
    try {
      await this.apiClient.logout();
    } catch (error) {
      log.warn('Remote logout failed; clearing local credentials', error.message);
    }
    this.currentToken = null;
    await this.clearLocalSession();
  }

  async clearLocalSession() {
    this.currentToken = null;
    this.currentEmployee = null;
    this.db.setSetting('encryptedAuthToken', null);
    this.db.setSetting('lastEmployeeId', null);
  }

  getCachedEmployee() {
    if (this.currentEmployee) return this.currentEmployee;

    const lastEmployeeId = this.db.getSetting('lastEmployeeId');
    return lastEmployeeId ? this.db.getEmployee(lastEmployeeId) : null;
  }

  async getToken() {
    if (!this.currentToken) {
      this.currentToken = await this.loadToken();
    }
    return this.currentToken;
  }

  async saveToken(token) {
    this.currentToken = token;
    if (!token) return;

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token).toString('base64');
      this.db.setSetting('encryptedAuthToken', encrypted);
    } else {
      throw new Error('Secure token storage is unavailable on this device.');
    }
  }

  async loadToken() {
    const encrypted = this.db.getSetting('encryptedAuthToken');
    if (encrypted && safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch (error) {
        log.warn('Stored token could not be decrypted', error.message);
      }
    }
    return null;
  }
}

function normalizeEmployee(employee = {}) {
  return {
    id: String(employee.id),
    name: employee.name || employee.fullName || 'Employee',
    email: employee.email || '',
    department: employee.department || '',
    designation: employee.designation || '',
    team: employee.team || '',
    status: employee.status || 'active'
  };
}

module.exports = { AuthService };
