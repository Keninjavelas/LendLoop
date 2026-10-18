import api from './api';

export const reminderService = {
  // Returns { summary, upcoming, blocked, failed, recent } for the reminder control centre.
  overview: () => api.get('/reminders/overview').then((res) => res.data),
  // params: { channel, mode, status, loanId, from, to, limit }
  // Returns { reminders, limit } - the caller's own logs, newest first.
  logs: (params) => api.get('/reminders', { params }).then((res) => res.data),
  // Only failed attempts and generated WhatsApp links can be retried.
  retry: (id) => api.post(`/reminders/${id}/retry`).then((res) => res.data),
  // Runs the same pass as the scheduler for the caller's own lending entries.
  run: () => api.post('/reminders/run').then((res) => res.data.summary),
};
