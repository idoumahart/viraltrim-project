import React from "react";

export interface ErrorFallbackProps {
  error?: Error;
  title?: string;
  message?: string;
  statusMessage?: string;
  resetErrorBoundary?: () => void;
  onRetry?: () => void;
  onGoHome?: () => void;
}

export function ErrorFallback({
  error,
  title = "Something went wrong",
  message,
  statusMessage,
  resetErrorBoundary,
  onRetry,
  onGoHome,
}: ErrorFallbackProps) {
  const handleReload = () => {
    if (onRetry) {
      onRetry();
    } else if (resetErrorBoundary) {
      resetErrorBoundary();
    } else {
      window.location.reload();
    }
  };

  const handleHome = () => {
    if (onGoHome) {
      onGoHome();
    } else {
      window.location.href = "/";
    }
  };

  const detail =
    message ?? error?.message ?? statusMessage ?? "Please try again or return home.";

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{detail}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={handleReload}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={handleHome}
          className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium"
        >
          Go home
        </button>
      </div>
    </div>
  );
}
