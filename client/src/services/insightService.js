import api from './api';

export const insightService = {
  // params: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
  get: (params) => api.get('/insights', { params }).then((res) => res.data),
  exportCsv: (params) =>
    api.get('/insights/export', { params, responseType: 'blob' }).then((res) => res),
};
