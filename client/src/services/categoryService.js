import api from './api';

export const categoryService = {
  // The six shared defaults plus the caller's own categories, each with usage counts.
  list: () => api.get('/categories').then((res) => res.data.categories),
  create: (payload) => api.post('/categories', payload).then((res) => res.data.category),
  update: (id, payload) => api.patch(`/categories/${id}`, payload).then((res) => res.data.category),
  remove: (id) => api.delete(`/categories/${id}`).then((res) => res.data),
};
