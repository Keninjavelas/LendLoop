import api from './api';

export const loanService = {
  // params: { role: 'lent' | 'borrowed', status, priority, q, overdue: 'true', sort }
  list: (params) => api.get('/loans', { params }).then((res) => res.data.loans),
  get: (id) => api.get(`/loans/${id}`).then((res) => res.data.loan),
  // Returns { loan, warnings } - warnings flag an entry armed with no usable channel.
  create: (payload) => api.post('/loans', payload).then((res) => res.data),
  updateSettings: (id, payload) => api.patch(`/loans/${id}`, payload).then((res) => res.data),
  updateDeadline: (id, payload) => api.patch(`/loans/${id}/deadline`, payload).then((res) => res.data),
  updatePriority: (id, payload) => api.patch(`/loans/${id}/priority`, payload).then((res) => res.data),
  updateCategory: (id, payload) => api.patch(`/loans/${id}/category`, payload).then((res) => res.data),
  markReturned: (id, reason) => api.patch(`/loans/${id}/return`, { reason }).then((res) => res.data.loan),

  history: (id) => api.get(`/loans/${id}/history`).then((res) => res.data.history),
  reminders: (id) => api.get(`/loans/${id}/reminders`).then((res) => res.data.reminders),
  reminderSchedule: (id) => api.get(`/loans/${id}/reminders/schedule`).then((res) => res.data),
  // params: { mode, message, templateId } - renders without writing a log entry.
  previewReminder: (id, params) =>
    api.get(`/loans/${id}/reminders/preview`, { params }).then((res) => res.data),
  sendReminder: (id, payload) => api.post(`/loans/${id}/reminders`, payload).then((res) => res.data),
};
