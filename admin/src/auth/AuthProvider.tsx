import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEMO_USER, IS_DEMO } from '../demo/mockApi';
import { api, tokenStore } from '../lib/api';

interface AdminUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AdminUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // The demo build has no real session to validate; drop straight into the
    // app so a reviewer isn't stopped by a login form guarding nothing.
    if (IS_DEMO) {
      setUser(DEMO_USER);
      setReady(true);
      return;
    }

    // A token in storage proves nothing — it may be expired or revoked. Ask
    // the API who it belongs to before treating the session as valid.
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    api
      .get<AdminUser>('/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ accessToken: string; user: AdminUser }>('/auth/login', {
      email,
      password,
    });
    tokenStore.set(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
