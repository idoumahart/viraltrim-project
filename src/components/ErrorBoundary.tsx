componentName: this.constructor.name,
      },
import React, { Component, ErrorInfo, ReactNode } from "react";
import { errorReporter } from "@/lib/errorReporter";
import { ErrorFallback } from "./ErrorFallback";

interface Props {
  children: ReactNode;
  fallback?: (
    error: Error,
    errorInfo: ErrorInfo,
    retry: () => void
  ) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Update state with error info
    this.setState({ errorInfo });

    // Report error to backend
    errorReporter.report({
      message: error.message,
      stack: error.stack || "",
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
      errorBoundaryProps: {