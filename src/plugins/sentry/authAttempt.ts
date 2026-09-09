/**
 * Classifying the credential a failed request presented.
 *
 * A 403 with no `Authorization` header is ordinary traffic. A 403 whose header
 * failed to authenticate is a **broken integration** — someone is presenting a
 * credential this deployment does not know. Reported identically, the second
 * hides inside the first: sydevs/SahajCloud#734 found a production caller that
 * had been denied 3,855 times over three months without anyone being able to
 * see that a key was involved.
 *
 * Pure on purpose, so the unit lane covers it without booting Payload.
 *
 * ⚠ **Nothing here may return the credential, or any substring of it.** The
 * only value derived from the key is a truncated SHA-256 of it.
 */
import { createHash } from 'node:crypto'

/** How the request's credential fared, from the error hook's point of view. */
export type AuthOutcome =
  /** No `Authorization` header. An anonymous read — ordinary traffic. */
  | 'anonymous'
  /** A header that authenticated. The caller is known and was denied on access control. */
  | 'authenticated'
  /** A header that did NOT authenticate. Always a broken integration. */
  | 'rejected'

export interface AuthAttempt {
  outcome: AuthOutcome
  /**
   * The auth collection slug, only for the pinned `<slug> API-Key <key>` shape
   * where position 0 is a collection slug by definition, never key material.
   */
  authCollection?: string
  /** The header's auth scheme, or `unknown` when it is not one we recognise. */
  authScheme?: string
  /** Truncated SHA-256 of the presented credential. Never the credential. */
  keyFingerprint?: string
}

/**
 * Schemes we are willing to echo back verbatim.
 *
 * An allowlist rather than "the first word of the header", because a malformed
 * header's first word can BE the credential — and echoing it would leak the
 * key this module exists to keep out of the logs.
 */
const KNOWN_SCHEMES = ['api-key', 'bearer', 'basic', 'digest', 'jwt'] as const

/** 12 hex characters: enough to tell two integrations apart, far too few to attack. */
const FINGERPRINT_LENGTH = 12

/**
 * A stable, non-reversible name for a credential.
 *
 * Hex SHA-256 truncated to {@link FINGERPRINT_LENGTH}, the same `createHash`
 * precedent as `r2SecretAccessKey` (`src/plugins/storage/r2Credentials.ts`).
 */
export const credentialFingerprint = (credential: string): string =>
  createHash('sha256').update(credential).digest('hex').slice(0, FINGERPRINT_LENGTH)

const namedScheme = (word: string): string =>
  KNOWN_SCHEMES.includes(word.toLowerCase() as (typeof KNOWN_SCHEMES)[number]) ? word : 'unknown'

/**
 * Split an `Authorization` header into the parts that are safe to report.
 *
 * The API-key format is `<slug> API-Key <key>`, pinned by the OpenAPI security
 * scheme (`src/plugins/openapi/specFilter.ts`). Anything else falls back to
 * `<scheme> <credential>`, and a single-token header is treated as all
 * credential — a header with nothing to name is not one worth naming.
 */
const parseAuthorization = (
  header: string,
): { authCollection?: string; authScheme?: string; credential: string } | null => {
  const parts = header.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null

  if (parts.length >= 3 && parts[1].toLowerCase() === 'api-key') {
    return {
      authCollection: parts[0],
      authScheme: 'API-Key',
      credential: parts.slice(2).join(' '),
    }
  }

  if (parts.length >= 2) {
    return { authScheme: namedScheme(parts[0]), credential: parts.slice(1).join(' ') }
  }

  return { credential: parts[0] }
}

/**
 * Decide which of the three auth outcomes a failed request represents.
 *
 * `hasUser` is `Boolean(req.user)`: Payload sets it once a strategy has
 * authenticated, so a header present with no user means every strategy refused
 * the credential. Attribution fields are returned only for that case — there is
 * nothing to attribute when nobody presented anything, and an authenticated
 * caller is already named by the Sentry `user`.
 */
export const classifyAuthAttempt = (
  authorization: string | null | undefined,
  hasUser: boolean,
): AuthAttempt => {
  const parsed = authorization ? parseAuthorization(authorization) : null

  if (!parsed) return { outcome: 'anonymous' }
  if (hasUser) return { outcome: 'authenticated' }

  return {
    outcome: 'rejected',
    authCollection: parsed.authCollection,
    authScheme: parsed.authScheme,
    keyFingerprint: credentialFingerprint(parsed.credential),
  }
}
