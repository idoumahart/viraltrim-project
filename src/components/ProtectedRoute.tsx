import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Sparkles } from 'lucide-react';
interface ProtectedRouteProps {
  children: React.ReactNode;
}
/**
 * Guarded Route Component
 * Protects premium production workspaces and enforces operator authorization.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center space-y-6">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center animate-pulse shadow-2xl shadow-primary/20">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <div className="absolute inset-[-4px] border border-primary/20 rounded-[20px] animate-ping" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-lg font-display font-black uppercase tracking-[0.3em] text-primary animate-pulse">
            Authenticating Link
          </h2>
          <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest opacity-50">
            Verifying operator clearance level...
          </p>
        </div>
      </div>
    );
  }
  if (!user) {
    // Redirection to login if unauthorized
    return <Navigate to="/login" replace />;
  }
  // Access granted to the workspace
  return <>{children}</>;
}