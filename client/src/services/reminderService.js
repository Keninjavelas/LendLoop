import api from './api';

export const reminderService = {
  // params: { channel, mode, status } - the caller's own logs, newest first.
  logs: (params) => api.get('/reminders', { params }).then((res) => res.data.reminders),
  // Fires the same pass the cron job runs, scoped to the caller's lending entries.
  run: () => api.post('/reminders/run').then((res) => res.data.summary),
};
