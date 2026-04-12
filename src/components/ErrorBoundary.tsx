import React, { Component, type ErrorInfo, type ReactNode } from "react";

import { errorReporter } from "@/lib/errorReporter";
import { ErrorFallback } from "./ErrorFallback";

interface Props {
  children: ReactNode;
  fallback?: (
    error: Error,
    errorInfo: ErrorInfo,
    retry: () => void
  ) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    errorReporter.report({
      message: error.message,
      stack: error.stack ?? "",
      componentStack: errorInfo.componentStack,
      errorBoundary: true,
      errorBoundaryProps: {},
      componentName: this.constructor.name,
    });
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      if (fallback && errorInfo) {
        return fallback(error, errorInfo, this.handleRetry);
      }
      return (
        <ErrorFallback
          error={error}
          resetErrorBoundary={this.handleRetry}
          title="App error"
        />
      );
    }

    return children;
  }
}
