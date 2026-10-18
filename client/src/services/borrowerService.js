import api from './api';

export const borrowerService = {
  // Returns { borrowers, manualEntries, counts }. Account-linked identities and
  // unverified manual snapshots are deliberately kept as separate lists.
  list: (params) => api.get('/borrowers', { params }).then((res) => res.data),
  get: (id) => api.get(`/borrowers/${id}`).then((res) => res.data),
};
