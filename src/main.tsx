import "@/lib/errorReporter";
import { enableMapSet } from "immer";

enableMapSet();

import React, { StrictMode } from "react";
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

import { HomePage } from "@/pages/HomePage";
import { DashboardPage } from "@/pages/DashboardPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DiscoveryPage from "@/pages/DiscoveryPage";
import BillingPage from "@/pages/BillingPage";
import EditorPage from "@/pages/EditorPage";
import ClipsPage from "@/pages/ClipsPage";
import SchedulePage from "@/pages/SchedulePage";
import SettingsPage from "@/pages/SettingsPage";
import AffiliatePage from "@/pages/AffiliatePage";

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
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
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
                    path="/editor/:videoId"
                    element={
                      <ProtectedRoute>
                        <EditorPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/clips"
                    element={
                      <ProtectedRoute>
                        <ClipsPage />
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
                <Toaster richColors position="top-right" />
              </SubscriptionProvider>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
