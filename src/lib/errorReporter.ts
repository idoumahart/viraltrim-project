interface BaseErrorData {
  url: string;
  timestamp: string;
}

interface ErrorReport extends BaseErrorData {
  message: string;
  stack?: string;
  componentStack?: string;
  errorBoundary?: boolean;
  errorBoundaryProps?: Record<string, unknown>;
  source?: string;
  lineno?: number;
  colno?: number;
  error?: unknown;
  level: "error" | "warning" | "info";
  parsedStack?: string;
  category?: "react" | "javascript" | "network" | "user" | "unknown";
}

// Removed legacy ErrorSignature and related internal dedup logic in favor of GlobalErrorDeduplication

type ConsoleMethod = "warn" | "error";
type ConsoleArgs = unknown[];

interface ErrorFilterResult {
  shouldReport: boolean;
  reason?: string;
}

interface ErrorContext {
  message: string;
  stack?: string;
  source?: string;
  url?: string;
  level: "error" | "warning" | "info";
}

// Shared categorization utility (used by both class and immediate interceptors)
const categorize = (message: string): ErrorReport["category"] => {
  if (message.includes("Warning:") || message.includes("React")) return "react";
  if (
    message.includes("fetch") ||