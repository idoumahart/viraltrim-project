import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Navigate } from "react-router-dom";
import { MailCheck, RefreshCcw, Loader2, MailWarning, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, refreshUser, loading: authLoading } = useAuth();
  
  const token = searchParams.get("token");
  
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState(false);
  
  const [resending, setResending] = useState(false);
  
  useEffect(() => {
    // If the user lands here but is already verified, bounce them back to the dashboard.
    if (!authLoading && user?.isEmailVerified && !verifySuccess) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, navigate, verifySuccess]);

  useEffect(() => {
    // Auto-verify if token is present
    if (token && !verifying && !verifySuccess && !verifyError) {
      void handleVerifyToken(token);
    }
  }, [token]);

  const handleVerifyToken = async (t: string) => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await api.verifyEmail(t);
      if (res.success) {
        setVerifySuccess(true);
        toast.success("Email Verified", { description: "Your email has been verified successfully." });
        if (user) {
          // Tell the auth hook to refresh the user to pull down isEmailVerified: true
          await refreshUser();
        }
      } else {
        setVerifyError(res.error || "The token is invalid or has expired.");
      }
    } catch (err) {
      setVerifyError("A system error occurred while verifying your email.");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!user) {
      // Must be logged in to resend
      navigate("/login?redirectTo=/verify-email");
      return;
    }
    setResending(true);
    try {
      const res = await api.resendVerificationEmail();
      if (res.success) {
        toast.success("Verification Email Sent", { description: "Check your inbox for the new link." });
      } else {
        toast.error("Failed to resend", { description: res.error || "Please try again later." });
      }
    } catch (err) {
      toast.error("System Error", { description: "Failed to resend verification email." });
    } finally {
      setResending(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If user is not logged in and they are just landing here without a token,
  // we can't resend anything, so redirect to login.
  if (!user && !token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="border-border/40 shadow-2xl bg-card/60 backdrop-blur-xl">
          {token && !verifySuccess && !verifyError ? (
            <CardContent className="pt-10 pb-8 flex flex-col items-center justify-center space-y-6">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div className="text-center space-y-2">
                <h3 className="text-lg font-bold">Verifying Email...</h3>
                <p className="text-sm text-muted-foreground">Checking your secure verification token.</p>
              </div>
            </CardContent>
          ) : verifySuccess ? (
            <>
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4 transition-all">
                  <ShieldCheck className="w-8 h-8 text-emerald-500" />
                </div>
                <CardTitle className="text-2xl font-display font-bold text-foreground">Email Verified</CardTitle>
                <CardDescription>Your account is now fully active.</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button 
                  className="w-full font-bold shadow-lg shadow-emerald-500/20 bg-emerald-500 hover:bg-emerald-600 text-white" 
                  onClick={() => navigate("/dashboard")}
                  size="lg"
                >
                  Enter Dashboard
                </Button>
              </CardFooter>
            </>
          ) : (
            <>
              <CardHeader className="text-center pb-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 transition-all hover:scale-110 hover:bg-primary/20">
                  {verifyError ? (
                    <MailWarning className="w-8 h-8 text-destructive" />
                  ) : (
                    <MailCheck className="w-8 h-8 text-primary" />
                  )}
                </div>
                <CardTitle className="text-2xl font-display font-bold text-foreground">
                  {verifyError ? "Verification Failed" : "Verify your Email"}
                </CardTitle>
                <CardDescription className="px-2">
                  {verifyError 
                    ? verifyError 
                    : `We've sent a secure verification link to ${user?.email}. Please click the link to unlock your dashboard.`}
                </CardDescription>
              </CardHeader>
              
              <CardFooter className="flex-col gap-4">
                <Button 
                  variant={verifyError ? "default" : "outline"}
                  className="w-full" 
                  onClick={() => void handleResend()}
                  disabled={resending}
                >
                  {resending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Resend Verification Link
                    </>
                  )}
                </Button>
                
                {user && (
                  <Button 
                    variant="ghost" 
                    className="w-full text-muted-foreground hover:text-foreground" 
                    onClick={() => {
                      api.logout().then(() => {
                        window.location.href = "/login";
                      });
                    }}
                  >
                    Back to Sign In (Log Out)
                  </Button>
                )}
              </CardFooter>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
