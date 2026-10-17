import api from './api';

export const templateService = {
  // params: { scope, priority }. Returns { templates, placeholders }.
  list: (params) => api.get('/templates', { params }).then((res) => res.data),
  create: (payload) => api.post('/templates', payload).then((res) => res.data.template),
  update: (id, payload) => api.patch(`/templates/${id}`, payload).then((res) => res.data.template),
  remove: (id) => api.delete(`/templates/${id}`).then((res) => res.data),
};
