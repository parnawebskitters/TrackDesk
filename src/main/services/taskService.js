const log = require('./logger');

class TaskService {
  constructor(db, apiClient) {
    this.db = db;
    this.apiClient = apiClient;
  }

  async refreshTasks(employeeId) {
    try {
      const response = await this.apiClient.fetchAssignedTasks();
      const tasks = Array.isArray(response) ? response : response.tasks || [];
      this.db.upsertTasks(employeeId, tasks.map(normalizeTask));
      return { tasks: this.db.listTasks(employeeId), offline: false };
    } catch (error) {
      log.warn('Task refresh failed, using local task cache', error.message);
      return {
        tasks: this.db.listTasks(employeeId),
        offline: true,
        warning: 'Showing cached tasks because the task server is unavailable.'
      };
    }
  }

  listTasks(employeeId) {
    return this.db.listTasks(employeeId);
  }

  markInProgress(taskId) {
    this.db.updateTaskStatus(taskId, 'in_progress');
  }

  markCompleted(taskId) {
    this.db.updateTaskStatus(taskId, 'completed');
  }
}

function normalizeTask(task = {}) {
  return {
    id: String(task.id),
    name: task.name || task.title || 'Untitled task',
    projectName: task.projectName || task.project?.name || 'Unassigned project',
    projectUniqueId: task.projectUniqueId || task.project_unique_id || task.project?.unique_id || '',
    clientName: task.clientName || task.client?.name || 'Unassigned client',
    estimatedHours: Number(task.estimatedHours || task.estimated_hours || 0),
    dueDate: task.dueDate || task.due_date || null,
    status: normalizeStatus(task.status),
    updatedAt: task.updatedAt || task.updated_at || new Date().toISOString()
  };
}

function normalizeStatus(status) {
  const normalized = String(status || 'active').toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'to_do') return 'active';
  if (['active', 'in_progress', 'completed'].includes(normalized)) return normalized;
  return 'active';
}

module.exports = { TaskService };
