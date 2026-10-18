import api from './api';

export const requestService = {
  create: (payload) => api.post('/requests', payload).then((res) => res.data.request),
  // params: { status, itemId }
  incoming: (params = {}) =>
    api.get('/requests/incoming', { params }).then((res) => res.data.requests),
  outgoing: (params = {}) =>
    api.get('/requests/outgoing', { params }).then((res) => res.data.requests),
  approve: (id) => api.patch(`/requests/${id}/approve`).then((res) => res.data),
  reject: (id) => api.patch(`/requests/${id}/reject`).then((res) => res.data.request),
  cancel: (id) => api.patch(`/requests/${id}/cancel`).then((res) => res.data.request),
};
