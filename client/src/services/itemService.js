import api from './api';

export const itemService = {
  // Returns { items, total, categories } - categories carries live counts for the filter chips.
  list: (params) => api.get('/items', { params }).then((res) => res.data),
  mine: () => api.get('/items/mine').then((res) => res.data.items),
  get: (id) => api.get(`/items/${id}`).then((res) => res.data.item),
  create: (payload) => api.post('/items', payload).then((res) => res.data.item),
  update: (id, payload) => api.patch(`/items/${id}`, payload).then((res) => res.data.item),
  remove: (id) => api.delete(`/items/${id}`).then((res) => res.data),
};
