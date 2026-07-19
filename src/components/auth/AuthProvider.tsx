'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  getSessionUser,
  loginUser,
  logoutUser,
  signupUser,
  type AuthUser,
} from '@/lib/auth';

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  refreshUser: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const refreshUser = useCallback(() => {
    setUser(getSessionUser());
  }, []);

  useEffect(() => {
    refreshUser();
    setReady(true);
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginUser({ email, password });
    if (!result.ok) return { ok: false, error: result.error };
    setUser(result.user);
    return { ok: true };
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const result = await signupUser({ name, email, password });
    if (!result.ok) return { ok: false, error: result.error };
    setUser(result.user);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    logoutUser();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      isAdmin: user?.role === 'admin',
      login,
      signup,
      logout,
      refreshUser,
    }),
    [user, ready, login, signup, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
