import { describe, expect, it } from 'vitest'

import { classifyAuthAttempt, credentialFingerprint } from '@/plugins/sentry/authAttempt'

const KEY = '3f7c1a2b-9d4e-4a10-8b55-6c2e0f9a1d33'

describe('classifyAuthAttempt', () => {
  it.each([null, undefined, '', '   '])('reports no header (%p) as anonymous', (header) => {
    expect(classifyAuthAttempt(header, false)).toEqual({ outcome: 'anonymous' })
  })

  it('reports a header that authenticated as authenticated, with nothing to attribute', () => {
    const attempt = classifyAuthAttempt(`clients API-Key ${KEY}`, true)

    expect(attempt).toEqual({ outcome: 'authenticated' })
  })

  it('reports a header that did not authenticate as rejected, naming the collection', () => {
    const attempt = classifyAuthAttempt(`clients API-Key ${KEY}`, false)

    expect(attempt.outcome).toBe('rejected')
    expect(attempt.authCollection).toBe('clients')
    expect(attempt.authScheme).toBe('API-Key')
    expect(attempt.keyFingerprint).toMatch(/^[0-9a-f]{12}$/)
  })

  it('names no collection for a scheme that is not the API-key format', () => {
    const attempt = classifyAuthAttempt(`Bearer ${KEY}`, false)

    expect(attempt.outcome).toBe('rejected')
    expect(attempt.authCollection).toBeUndefined()
    expect(attempt.authScheme).toBe('Bearer')
  })

  it('refuses to echo an unrecognised scheme word, which may be the credential itself', () => {
    // A two-token header whose first word is not a known scheme: reporting it
    // verbatim is how key material leaks out through the "scheme" field.
    expect(classifyAuthAttempt(`${KEY} something`, false).authScheme).toBe('unknown')
    expect(classifyAuthAttempt(KEY, false).authScheme).toBeUndefined()
  })

  it('never returns the credential or any substring of it', () => {
    const serialised = JSON.stringify([
      classifyAuthAttempt(`clients API-Key ${KEY}`, false),
      classifyAuthAttempt(`Bearer ${KEY}`, false),
      classifyAuthAttempt(KEY, false),
      classifyAuthAttempt(`${KEY} extra`, false),
    ])

    expect(serialised).not.toContain(KEY)
    // The head and tail are what a naive truncation ("last 4 characters") leaks.
    expect(serialised).not.toContain(KEY.slice(0, 8))
    expect(serialised).not.toContain(KEY.slice(-12))
  })

  it('tolerates a malformed API-key header without treating the key as a slug', () => {
    // `<slug> API-Key` with nothing after it: there is no key, so the trailing
    // word is the credential and the slug must not be reported as one.
    const attempt = classifyAuthAttempt('clients API-Key', false)

    expect(attempt.outcome).toBe('rejected')
    expect(attempt.authCollection).toBeUndefined()
  })
})

describe('credentialFingerprint', () => {
  it('is stable, so one broken integration stays one signal', () => {
    expect(credentialFingerprint(KEY)).toBe(credentialFingerprint(KEY))
  })

  it('separates two different credentials', () => {
    expect(credentialFingerprint(KEY)).not.toBe(credentialFingerprint(`${KEY}1`))
  })

  it('is 12 hex characters of SHA-256, not the credential', () => {
    expect(credentialFingerprint(KEY)).toMatch(/^[0-9a-f]{12}$/)
    expect(credentialFingerprint(KEY)).not.toContain(KEY.slice(0, 8))
  })
})
