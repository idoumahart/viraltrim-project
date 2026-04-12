if (!container) throw new Error('System Provisioning Failure: Root target not found.');
const root = createRoot(container);
/**
 * PRODUCTION PROVIDER HIERARCHY
 * Ensures React context stability across all multi-modal interfaces.
import '@/lib/errorReporter';
import { enableMapSet } from "immer";
enableMapSet();
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
// Critical UI Foundation
import '@/index.css';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
// Providers
import { AuthProvider } from '@/hooks/use-auth';
import { SubscriptionProvider } from '@/hooks/use-subscription';
import { ProtectedRoute } from '@/components/ProtectedRoute';
// Application Views
import { HomePage } from '@/pages/HomePage';
import { DashboardPage } from '@/pages/DashboardPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DiscoveryPage from '@/pages/DiscoveryPage';
import BillingPage from '@/pages/BillingPage';
import EditorPage from '@/pages/EditorPage';
import ClipsPage from '@/pages/ClipsPage';
import SchedulePage from '@/pages/SchedulePage';
import SettingsPage from '@/pages/SettingsPage';
import AffiliatePage from '@/pages/AffiliatePage';
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});
const container = document.getElementById('root');