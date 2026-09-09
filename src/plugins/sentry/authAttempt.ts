/**
 * Classifying the credential a failed request presented.
 *
 * Pure on purpose, so the unit lane covers it without booting Payload.
 *
 * ⚠ **Nothing here may return the credential, or any substring of it.** The
 * only value derived from the key is a truncated SHA-256 of it.
 *
 * Why the signal exists and what it cannot see: `docs/architecture.md`.
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
  /** The auth collection, set only when the header named a real one. */
  authCollection?: string
  /** The header's auth scheme, or `unknown` when it is not one we recognise. */
  authScheme?: string
  /** Truncated SHA-256 of the presented credential. Never the credential. */
  keyFingerprint?: string
}

/**
 * Schemes we are willing to echo back verbatim.
 *
 * ⚠ **Allowlist, never "the first word of the header"** — a malformed header's
 * first word can BE the credential, and echoing it leaks the key.
 */
const KNOWN_SCHEMES: readonly string[] = ['api-key', 'bearer', 'basic', 'digest', 'jwt']

/** 12 hex characters: enough to tell two integrations apart, far too few to attack. */
const FINGERPRINT_LENGTH = 12

/** A stable, non-reversible name for a credential. Never the credential. */
export const credentialFingerprint = (credential: string): string =>
  createHash('sha256').update(credential).digest('hex').slice(0, FINGERPRINT_LENGTH)

const namedScheme = (word: string): string =>
  KNOWN_SCHEMES.includes(word.toLowerCase()) ? word : 'unknown'

/**
 * Split an `Authorization` header into the parts that are safe to report.
 *
 * The API-key format is `<slug> API-Key <key>`, pinned by the OpenAPI security
 * scheme (`src/plugins/openapi/specFilter.ts`). Anything else is
 * `<scheme> <credential>`, and a single-token header is treated as all credential.
 */
const parseAuthorization = (
  header: string,
): { authCollection?: string; authScheme?: string; credential: string } | null => {
  const trimmed = header.trim()
  if (!trimmed) return null

  const parts = trimmed.split(/\s+/)

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
 * `hasUser` is `Boolean(req.user)`: Payload sets it once any strategy has
 * authenticated, so a header present with no user means every strategy refused
 * the credential. Attribution is returned only for that case.
 *
 * ⚠ **`isKnownCollection` bounds the one caller-controlled field.** Position 0
 * of the header reaches a Sentry fingerprint, so an unchecked word would let
 * any caller mint one Sentry issue per value it invents. Only the config layer
 * knows the real slugs, so it answers, and an unrecognised word reports as no
 * collection at all.
 */
export const classifyAuthAttempt = (
  authorization: string | null | undefined,
  hasUser: boolean,
  isKnownCollection: (slug: string) => boolean,
): AuthAttempt => {
  const parsed = parseAuthorization(authorization ?? '')

  if (!parsed) return { outcome: 'anonymous' }
  if (hasUser) return { outcome: 'authenticated' }

  const authCollection =
    parsed.authCollection && isKnownCollection(parsed.authCollection)
      ? parsed.authCollection
      : undefined

  return {
    outcome: 'rejected',
    authCollection,
    authScheme: parsed.authScheme,
    keyFingerprint: credentialFingerprint(parsed.credential),
  }
}
