import { useContext, useEffect } from 'react'
import {
  UNSAFE_DataRouterStateContext,
  isRouteErrorResponse,
  useInRouterContext,
  useRouteError,
} from 'react-router-dom'

import { errorReporter } from '@/lib/errorReporter'
import { ErrorFallback } from './ErrorFallback'

type RouteError = unknown

function reportRouteError(error: RouteError) {
  if (!error) return

  let errorMessage = 'Unknown route error'
  let errorStack = ''

  if (isRouteErrorResponse(error)) {
    errorMessage = `Route Error ${error.status}: ${error.statusText}`
    if (error.data) {
      errorMessage += ` - ${JSON.stringify(error.data)}`
    }
  } else if (error instanceof Error) {
    errorMessage = error.message
    errorStack = error.stack || ''
  } else if (typeof error === 'string') {
    errorMessage = error
  } else {
    try {
      errorMessage = JSON.stringify(error)
    } catch {
      errorMessage = String(error)
    }
  }

  errorReporter.report({
    message: errorMessage,
    stack: errorStack,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    source: 'react-router',