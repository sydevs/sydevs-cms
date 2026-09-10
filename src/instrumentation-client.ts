/**
 * Client-side instrumentation for Sentry (@sentry/nextjs)
 *
 * This file is automatically executed by Next.js when a new browser instance
 * loads the application. It initializes Sentry for client-side error tracking.
 * Server-side errors initialize in src/sentry.server.config.ts via
 * src/instrumentation.ts.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
import * as Sentry from '@sentry/nextjs'

import { clientEnv } from '@/lib/env/client'
import { clientDeploymentEnvironment } from '@/lib/env/deploymentEnvironment'

// Initialize Sentry for client-side errors only
// Server-side errors are handled by the Sentry plugin
//
// ⚠ This branch is unreachable in a browser today: `clientEnv` parses a bare
// `process.env`, which is an empty object there, so the DSN is always
// undefined and Sentry never initializes client-side (#760).
if (clientEnv.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: clientEnv.NEXT_PUBLIC_SENTRY_DSN,
    environment: clientDeploymentEnvironment(),
    // Disable performance tracing, only capture errors
    tracesSampleRate: 0,
  })
} else if (process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line no-console
  console.info(
    '[Sentry] Client-side error tracking disabled (NEXT_PUBLIC_SENTRY_DSN not configured)',
  )
}

// Instrument App Router navigations (Sentry requires this export from the
// client instrumentation file).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
