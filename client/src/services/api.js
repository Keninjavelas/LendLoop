import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
});

// Auth lives in an HttpOnly cookie, so a 401 anywhere means the session is gone.
// Pages react to it through useAuth rather than each call handling it separately.
export function getApiMessage(error, fallback = 'Something went wrong') {
  const serverMessage = error?.response?.data?.message;
  if (serverMessage) return serverMessage;
  if (error?.code === 'ERR_NETWORK') {
    return 'Cannot reach the LendLoop API. Check that the server is running.';
  }
  return fallback;
}

export default api;
