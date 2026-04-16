import { User } from '@/lib/api-client';

export interface AuthState {
    user: User | null;
    loading: boolean;
    error: string | null;
}

export interface AuthContextValue extends AuthState {
    login: (email: string, password: string) => Promise<boolean>;
    register: (email: string, password: string, displayName?: string, username?: string) => Promise<boolean>;
    logout: () => Promise<void>;
    updateProfile: (data: Partial<User>) => Promise<boolean>;
    refreshUser: () => Promise<void>;
    clearError: () => void;
    /** The active plan — respects owner dev-tier override in sessionStorage. */
    effectivePlan: string;
    /** Owner-only: set a temporary plan override for testing. Pass null to reset. */
    setDevPlan: (plan: string | null) => void;
}

export interface LoginResponse {
    user: User;
    token: string;
}

export interface RegisterResponse {
    user: User;
}