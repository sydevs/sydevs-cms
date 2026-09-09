/**
 * Custom Sentry Plugin for PayloadCMS
 *
 * Provides Sentry error capture for Payload CMS operations via an afterError hook.
 * Uses @sentry/nextjs (the app runs on a long-lived Node server).
 *
 * Based on the official @payloadcms/plugin-sentry.
 *
 * @see https://payloadcms.com/docs/plugins/sentry
 */
import type { Config, PayloadRequest } from 'payload'

import * as Sentry from '@sentry/nextjs'

import { mapPostgresCastError } from '@/lib/databaseErrors'
import { serverEnv } from '@/lib/env'
import { deploymentEnvironment } from '@/lib/env/deploymentEnvironment'

import { classifyAuthAttempt } from './authAttempt'

/**
 * Context object for Sentry error capture
 */
interface SentryContext {
  user?: {
    id?: string
    email?: string
  }
  tags?: Record<string, string | undefined>
  extra?: Record<string, unknown>
  level?: 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug'
  /**
   * Overrides Sentry's default grouping. Set only where two errors that look
   * alike are different incidents — leave it unset and Sentry groups as usual.
   */
  fingerprint?: string[]
}

export interface SentryPluginOptions {
  /**
   * Array of additional HTTP status codes to capture (500+ are always captured)
   * @example [400, 403, 404]
   */
  captureErrors?: number[]

  /**
   * Enable debug logging of captured exceptions
   * @default false
   */
  debug?: boolean

  /**
   * Custom context function to enrich Sentry error context
   */
  context?: (args: { defaultContext: SentryContext; req: PayloadRequest }) => Partial<SentryContext>

  /**
   * Enable/disable the plugin
   * @default true
   */
  enabled?: boolean
}

/**
 * Create a Sentry plugin for PayloadCMS with Cloudflare Workers support
 *
 * @param options - Plugin configuration options
 * @returns Payload plugin configuration
 *
 * @example
 * ```ts
 * import { sentryPlugin } from '@/plugins/sentry'
 *
 * export default buildConfig({
 *   plugins: [
 *     sentryPlugin({
 *       captureErrors: [400, 403, 404],
 *       debug: process.env.NODE_ENV !== 'production',
 *       context: ({ defaultContext, req }) => ({
 *         ...defaultContext,
 *         tags: {
 *           ...defaultContext.tags,
 *           locale: req.locale,
 *         },
 *       }),
 *     }),
 *   ],
 * })
 * ```
 */
export const sentryPlugin = (options: SentryPluginOptions = {}) => {
  const { captureErrors = [], debug = false, context, enabled = true } = options

  return (config: Config): Config => {
    // Skip plugin if disabled or no DSN configured
    if (!enabled || !serverEnv.NEXT_PUBLIC_SENTRY_DSN) {
      return config
    }

    return {
      ...config,
      hooks: {
        ...config.hooks,
        afterError: [
          ...(config.hooks?.afterError ?? []),
          async (args) => {
            const { error, req } = args

            // A Postgres cast failure is the caller sending a value the column cannot
            // hold, so it is a 400 rather than an incident. `captureErrors` includes 400,
            // so restatusing alone would not stop the report — and asking the same pure
            // predicate rather than reading a flag the other hook sets keeps this
            // independent of the order the two plugins are registered in.
            //
            // ⚠ **This suppresses a 22P02 OUR code composed too**, not only a caller's.
            // Do not try to discriminate on `req.user`: access control denies an
            // anonymous read before any SQL runs, so it is set on every error that
            // reaches here. `docs/architecture.md` has the trade. (sydevs/SahajCloud#670)
            if (mapPostgresCastError(error)) {
              return
            }

            const status =
              'status' in error && typeof error.status === 'number' ? error.status : 500

            // Capture 500+ errors and any explicitly configured status codes
            if (status >= 500 || captureErrors.includes(status)) {
              const attempt = classifyAuthAttempt(
                req.headers?.get?.('authorization'),
                Boolean(req.user),
              )

              // A presented-and-rejected credential is a broken integration, not
              // traffic. Escalating it only below 500 keeps a server error's own
              // level and grouping intact — that is a different incident, and the
              // caller's credential is not what is wrong with it. (#734)
              const credentialRejected = attempt.outcome === 'rejected' && status < 500

              // Cloudflare sets CF-Connecting-IP at the edge; a direct origin hit
              // has none. Read the same way as `verifyTurnstileOrFail`.
              const userAgent = req.headers?.get?.('user-agent') ?? undefined
              const ip = req.headers?.get?.('cf-connecting-ip') ?? undefined

              const defaultContext: SentryContext = {
                user: req.user
                  ? {
                      id: String(req.user.id),
                      email: 'email' in req.user ? String(req.user.email) : undefined,
                    }
                  : undefined,
                tags: {
                  environment: deploymentEnvironment(),
                  locale: req.locale,
                  collection: 'collection' in args ? String(args.collection?.slug) : undefined,
                  // `key_fingerprint` is deliberately a tag rather than an extra,
                  // despite its cardinality: naming WHICH integration is broken is
                  // the whole point, and only a tag is searchable.
                  ...(credentialRejected
                    ? {
                        auth_outcome: attempt.outcome,
                        auth_collection: attempt.authCollection,
                        auth_scheme: attempt.authScheme,
                        key_fingerprint: attempt.keyFingerprint,
                      }
                    : {}),
                },
                extra: {
                  status,
                  url: req.url,
                  ...(credentialRejected ? { userAgent, ip } : {}),
                },
                level: status >= 500 || credentialRejected ? 'error' : 'warning',
                // Group by the auth collection, not the key fingerprint: a broken
                // integration must not be able to open one Sentry issue per key it
                // presents. The tag above segments within the group.
                ...(credentialRejected
                  ? {
                      fingerprint: [
                        'credential-rejected',
                        String(status),
                        attempt.authCollection ?? 'unknown',
                      ],
                    }
                  : {}),
              }

              // Mirror to the application log, so a denial stays diagnosable from
              // Railway without opening Sentry — the same shape
              // `assertClientOriginAllowed` uses. Deliberately outside the custom
              // `context` function below: that may reshape the report, but the
              // denial itself still happened.
              if (credentialRejected) {
                req.payload.logger.warn({
                  msg: 'sentryPlugin: API credential presented and rejected',
                  status,
                  url: req.url,
                  authCollection: attempt.authCollection ?? null,
                  authScheme: attempt.authScheme ?? null,
                  keyFingerprint: attempt.keyFingerprint ?? null,
                  userAgent: userAgent ?? null,
                  ip: ip ?? null,
                })
              }

              // Apply custom context if provided
              const finalContext = context ? context({ defaultContext, req }) : defaultContext

              // Capture the exception with scope
              Sentry.withScope((scope) => {
                if (finalContext.user) {
                  scope.setUser(finalContext.user)
                }
                if (finalContext.tags) {
                  Object.entries(finalContext.tags).forEach(([key, value]) => {
                    if (value) scope.setTag(key, value)
                  })
                }
                if (finalContext.extra) {
                  Object.entries(finalContext.extra).forEach(([key, value]) => {
                    scope.setExtra(key, value)
                  })
                }
                if (finalContext.level) {
                  scope.setLevel(finalContext.level)
                }
                if (finalContext.fingerprint) {
                  scope.setFingerprint(finalContext.fingerprint)
                }
                Sentry.captureException(error)
              })

              // Debug logging
              if (debug) {
                req.payload.logger.info({
                  msg: 'Sentry captured exception',
                  error: error.message,
                  status,
                  collection: finalContext.tags?.collection,
                })
              }
            }
          },
        ],
      },
    }
  }
}
