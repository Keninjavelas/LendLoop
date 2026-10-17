import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { authService } from '../services/authService';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  // The session lives in an HttpOnly cookie, so it survives a refresh and has to
  // be re-read from the server on every mount.
  useEffect(() => {
    authService
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setInitializing(false));
  }, []);

  // An expired session surfaces as a 401 on some unrelated call. Dropping the user
  // here lets ProtectedRoute redirect to /login instead of rendering a broken page.
  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401) setUser(null);
        return Promise.reject(error);
      },
    );
    return () => api.interceptors.response.eject(interceptorId);
  }, []);

  const login = useCallback(async (credentials) => {
    const nextUser = await authService.login(credentials);
    setUser(nextUser);
    return nextUser;
  }, []);

  const register = useCallback(async (payload) => {
    const nextUser = await authService.register(payload);
    setUser(nextUser);
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const deleteAccount = useCallback(async (payload) => {
    await authService.deleteAccount(payload);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      initializing,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      deleteAccount,
    }),
    [user, initializing, login, register, logout, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
