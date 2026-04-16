import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { MailCheck, RefreshCw, LogOut } from "lucide-react";

interface VerifiedRouteProps {
  children: React.ReactNode;
}

/**
 * Wraps any studio route that requires a verified email.
 * If the user's email is unverified, renders a full-page overlay
 * instead of the child page. Never redirects — keeps the URL intact.
 */
export function VerifiedRoute({ children }: VerifiedRouteProps) {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [resending, setResending] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  // Still loading — let the auth context handle it
  if (!user) return null;

  // Verified — render normally
  if (user.isEmailVerified) return <>{children}</>;

  // ─── Unverified overlay ─────────────────────────────────────────────────────
  const handleResend = async () => {
    setResending(true);
    try {
      const res = await api.resendVerificationEmail();
      if (res.success) {
        toast.success("Verification email sent — check your inbox.");
      } else {
        toast.error(res.error ?? "Failed to resend. Try again later.");
      }
    } catch {
      toast.error("Network error. Check your connection.");
    } finally {
      setResending(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshUser();
      // If still not verified after refresh, keep showing the gate
    } catch {
      toast.error("Could not refresh session.");
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6 max-w-md w-full text-center">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <MailCheck className="h-9 w-9 text-primary" />
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-display font-bold">Verify your email</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            We sent a verification link to{" "}
            <span className="font-medium text-foreground">{user.email}</span>.
            <br />
            Click the link in your inbox to unlock the Studio.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 w-full">
          <Button
            className="btn-gradient gap-2 h-11"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Checking…" : "I've verified — refresh"}
          </Button>

          <Button
            variant="outline"
            className="h-11 gap-2"
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? "Sending…" : "Resend verification email"}
          </Button>

          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2" onClick={handleLogout}>
            <LogOut className="h-3.5 w-3.5" />
            Sign in with a different account
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Check your spam folder if you don't see it within a minute.
        </p>
      </div>
    </div>
  );
}
