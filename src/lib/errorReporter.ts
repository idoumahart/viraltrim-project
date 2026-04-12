/**
 * Global client error hooks — extend to POST /api/client-error when needed.
 */
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[unhandledrejection]", event.reason);
  });
}

export type ClientErrorPayload = {
  message: string;
  stack: string;
  componentStack?: string | null | undefined;
  errorBoundary?: boolean;
  errorBoundaryProps?: Record<string, unknown>;
  componentName?: string;
};

export const errorReporter = {
  report(payload: ClientErrorPayload): void {
    console.error("[client-error]", payload);
  },
};
