'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  getSessionUserAsync,
  isCloudAuth,
  loginUser,
  logoutUser,
  signupUser,
  type AuthUser,
} from '@/lib/auth';
import { pushCloudData } from '@/lib/cloud-sync';

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  isAdmin: boolean;
  cloudEnabled: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const refreshUser = useCallback(async () => {
    const next = await getSessionUserAsync();
    setUser(next);
    userIdRef.current = next?.id ?? null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshUser();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  // Auto-save app data to cloud every 20s while logged in (cloud mode)
  useEffect(() => {
    if (!isCloudAuth() || !user?.id) return;

    const tick = () => {
      void pushCloudData(user.id);
    };

    tick();
    const timer = window.setInterval(tick, 20_000);

    const onHide = () => {
      if (document.visibilityState === 'hidden') tick();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', tick);
      void pushCloudData(user.id);
    };
  }, [user?.id]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginUser({ email, password });
    if (!result.ok) return { ok: false, error: result.error };
    setUser(result.user);
    userIdRef.current = result.user.id;
    if (typeof window !== 'undefined') {
      window.setTimeout(() => window.location.assign('/app'), 150);
    }
    return { ok: true };
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const result = await signupUser({ name, email, password });
    if (!result.ok) return { ok: false, error: result.error };
    setUser(result.user);
    userIdRef.current = result.user.id;
    if (typeof window !== 'undefined') {
      window.setTimeout(() => window.location.assign('/app'), 150);
    }
    return { ok: true };
  }, []);

  // NOTE: login/signup navigate to /app after success — guests always enter via home first.

  const logout = useCallback(async () => {
    await logoutUser();
    setUser(null);
    userIdRef.current = null;
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      isAdmin: user?.role === 'admin',
      cloudEnabled: isCloudAuth(),
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
