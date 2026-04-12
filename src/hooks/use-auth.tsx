import React, { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import { api, type User } from '@/lib/api-client';
import { type AuthState, type AuthContextValue } from '@/types/auth';
const AuthContext = createContext<AuthContextValue | null>(null);
// eslint-disable-next-line react-refresh/only-export-components
export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({
        user: null,
        loading: true,
        error: null,
    });
    useEffect(() => {
        let isMounted = true;
        const initAuth = async () => {
            if (!api.isAuthenticated()) {
                if (isMounted) setState({ user: null, loading: false, error: null });
                return;
            }
            try {
                const response = await api.getCurrentUser();
                if (!isMounted) return;
                if (response && response.success && response.data) {
                    setState({ user: response.data, loading: false, error: null });
                } else {
                    api.setToken(null);
                    setState({ user: null, loading: false, error: null });
                }
            } catch (err) {
                if (!isMounted) return;
                api.setToken(null);
                setState({ user: null, loading: false, error: null });
                console.error('[AUTH INIT ERROR]', err);
            }
        };
        initAuth();
        return () => { isMounted = false; };
    }, []);
    const login = useCallback(async (email: string, password: string): Promise<boolean> => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const response = await api.login(email, password);
            if (response.success && response.data) {
                setState({ user: response.data.user, loading: false, error: null });