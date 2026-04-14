import React, {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { api, type User } from "@/lib/api-client";
import { type AuthState, type AuthContextValue } from "@/types/auth";

const AuthContext = createContext<AuthContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      try {
        const response = await api.getCurrentUser();
        if (!isMounted) {
          return;
        }
        if (response?.success && response.data) {
          setState({ user: response.data, loading: false, error: null });
        } else {
          setState({ user: null, loading: false, error: null });
        }
      } catch (err) {
        if (!isMounted) {
          return;
        }
        setState({ user: null, loading: false, error: null });
        console.error("[AUTH INIT ERROR]", err);
      }
    };
    void initAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await api.login(email, password);
      if (response.success && response.data) {
        setState({ user: response.data.user, loading: false, error: null });
        return true;
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        error: response.error || "Login failed",
      }));
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setState((prev) => ({ ...prev, loading: false, error: message }));
      return false;
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName?: string, companyName?: string, phoneNumber?: string): Promise<boolean> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const response = await api.register(email, password, displayName, companyName, phoneNumber);
        if (response.success && response.data) {
          setState({ user: response.data.user, loading: false, error: null });
          return true;
        }
        setState((prev) => ({
          ...prev,
          loading: false,
          error: response.error || "Registration failed",
        }));
        return false;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Registration failed";
        setState((prev) => ({ ...prev, loading: false, error: message }));
        return false;
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      await api.logout();
    } catch {
      // Intentionally bypassed on local error
    }
    setState({ user: null, loading: false, error: null });
  }, []);

  const updateProfile = useCallback(async (data: Partial<User>): Promise<boolean> => {
    try {
      const res = await api.updateProfile(data);
      if (res.success && res.data) {
        setState((prev) => ({ ...prev, user: res.data ?? prev.user }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await api.getCurrentUser();
    if (res.success && res.data) {
      setState((prev) => ({ ...prev, user: res.data ?? prev.user }));
    }
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    register,
    logout,
    updateProfile,
    refreshUser,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
