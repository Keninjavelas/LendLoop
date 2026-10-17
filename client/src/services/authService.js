import api from './api';

export const authService = {
  register: (payload) => api.post('/auth/register', payload).then((res) => res.data.user),
  login: (payload) => api.post('/auth/login', payload).then((res) => res.data.user),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me').then((res) => res.data.user),
  updateProfile: (payload) => api.patch('/users/me', payload).then((res) => res.data.user),
};
