import "@/lib/errorReporter";
import { enableMapSet } from "immer";

enableMapSet();

import React, { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

import "@/index.css";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/hooks/use-auth";
import { SubscriptionProvider } from "@/hooks/use-subscription";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { VerifiedRoute } from "@/components/VerifiedRoute";


import { HomePage } from "@/pages/HomePage";
const DashboardPage = React.lazy(() => import("@/pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const LoginPage = React.lazy(() => import("@/pages/LoginPage"));
const RegisterPage = React.lazy(() => import("@/pages/RegisterPage"));
const VerifyEmailPage = React.lazy(() => import("@/pages/VerifyEmailPage"));
const DiscoveryPage = React.lazy(() => import("@/pages/DiscoveryPage"));
const MyVideosPage = React.lazy(() => import("@/pages/MyVideosPage"));
const BillingPage = React.lazy(() => import("@/pages/BillingPage"));
const EditorPage = React.lazy(() => import("@/pages/EditorPage"));
const ClipsPage = React.lazy(() => import("@/pages/ClipsPage"));
const SchedulePage = React.lazy(() => import("@/pages/SchedulePage"));
const SettingsPage = React.lazy(() => import("@/pages/SettingsPage"));
const StudioGeneratorPage = React.lazy(() => import("@/pages/StudioGeneratorPage").then(m => ({ default: m.StudioGeneratorPage })));
const AffiliatePage = React.lazy(() => import("@/pages/AffiliatePage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found");
}

const root = createRoot(container);

root.render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
          <BrowserRouter>
            <AuthProvider>
              <SubscriptionProvider>
                <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="animate-pulse">Loading...</div></div>}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/verify-email" element={<VerifyEmailPage />} />
                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute>
                          <DashboardPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/discovery"
                      element={
                        <ProtectedRoute>
                          <DiscoveryPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/studio/videos"
                      element={
                        <ProtectedRoute>
                          <VerifiedRoute>
                            <MyVideosPage />
                          </VerifiedRoute>
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/studio/editor"
                      element={
                        <ProtectedRoute>
                          <VerifiedRoute>
                            <EditorPage />
                          </VerifiedRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/studio/generator/:videoId?"
                      element={
                        <ProtectedRoute>
                          <VerifiedRoute>
                            <StudioGeneratorPage />
                          </VerifiedRoute>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/studio/clips"
                      element={
                        <ProtectedRoute>
                          <VerifiedRoute>
                            <ClipsPage />
                          </VerifiedRoute>
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/schedule"
                      element={
                        <ProtectedRoute>
                          <SchedulePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <ProtectedRoute>
                          <SettingsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/billing"
                      element={
                        <ProtectedRoute>
                          <BillingPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/affiliate"
                      element={
                        <ProtectedRoute>
                          <AffiliatePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
                <Toaster richColors position="top-right" />
              </SubscriptionProvider>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
