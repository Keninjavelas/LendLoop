import api from './api';

export const itemService = {
  // Returns { items, total, categories } - categories carries live counts for the filter chips.
  list: (params) => api.get('/items', { params }).then((res) => res.data),
  // params: { view: 'all' | 'available' | 'borrowed' | 'archived', q, sort }
  // Returns { items, counts } so the inventory tabs can show live totals.
  mine: (params) => api.get('/items/mine', { params }).then((res) => res.data),
  get: (id) => api.get(`/items/${id}`).then((res) => res.data.item),
  create: (payload) => api.post('/items', payload).then((res) => res.data.item),
  update: (id, payload) => api.patch(`/items/${id}`, payload).then((res) => res.data.item),
  archive: (id) => api.patch(`/items/${id}/archive`).then((res) => res.data.item),
  restore: (id) => api.patch(`/items/${id}/restore`).then((res) => res.data.item),
  remove: (id) => api.delete(`/items/${id}`).then((res) => res.data),
};
