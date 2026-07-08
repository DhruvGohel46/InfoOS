import { workerAPI } from '../api/workers';

// Thin wrapper so new UI components can import from a `services` folder
// without touching the existing `api/workers` implementation.
export const workerService = {
  getStats: () => workerAPI.getStats(),
  getWorkers: (status) => workerAPI.getWorkers(status),
  createWorker: (data) => workerAPI.createWorker(data),
  getWorker: (id) => workerAPI.getWorker(id),
  updateWorker: (id, data) => workerAPI.updateWorker(id, data),
  deleteWorker: (id) => workerAPI.deleteWorker(id),
  addAdvance: (id, data) => workerAPI.addAdvance(id, data),
  getAdvances: (id) => workerAPI.getAdvances(id),
  generateSalary: (id, month, year) => workerAPI.generateSalary(id, month, year),
  getSalaryHistory: (id) => workerAPI.getSalaryHistory(id),
  markPaid: (paymentId) => workerAPI.markPaid(paymentId),
  getWorkerAttendance: (id) => workerAPI.getWorkerAttendance(id),
  markAttendance: (id, data) => workerAPI.markAttendance(id, data),
  updateAttendance: (id, data) => workerAPI.updateAttendance(id, data),
  bulkMarkPresent: () => workerAPI.bulkMarkPresent(),
  checkAttendanceStatus: () => workerAPI.checkAttendanceStatus(),
  getWorkerTypes: () => workerAPI.getWorkerTypes(),
};

export default workerService;
