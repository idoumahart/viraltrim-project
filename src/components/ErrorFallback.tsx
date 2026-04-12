import React from 'react';
/**
 * ErrorFallbackProps
 * Updated to include 'message' and 'statusMessage' for full compatibility with RouteErrorBoundary.
 * 'error' is made optional to support system-level boundaries that may not pass an error object directly.
 */
export interface ErrorFallbackProps {
  error?: Error | any;
  title?: string;
  message?: string;
  statusMessage?: string;
  resetErrorBoundary?: () => void;
  onRetry?: () => void;
  onGoHome?: () => void;
}
/**
 * A robust, high-contrast error fallback UI for ViralTrim.
 * This component is designed to be low-dependency to ensure it renders even when
 * global contexts or complex hooks fail.
 */
export function ErrorFallback({ 
  error, 
  title, 
  message, 
  statusMessage, 
  resetErrorBoundary, 
  onRetry, 
  onGoHome 
}: ErrorFallbackProps) {
  const handleReload = () => {
    if (onRetry) {
      onRetry();
    } else if (resetErrorBoundary) {
      resetErrorBoundary();
    } else {
      window.location.reload();
    }
  };
  const handleHome = () => {
    if (onGoHome) {
      onGoHome();
    } else {
      window.location.href = '/';