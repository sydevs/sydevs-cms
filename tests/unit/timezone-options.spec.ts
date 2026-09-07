import { createHash } from 'node:crypto'

import { getTimeZones } from '@vvo/tzdb'
import { defaultTimezones } from 'payload/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SUPPORTED_TIMEZONES } from '@/lib/timezones'

/**
 * The pinned member list, as a digest of the values in order.
 *
 * Every `timezone: true` field bakes a Postgres enum from this list, so both the
 * membership and the ORDER are schema. Before #722 the order came straight from
 * `getTimeZones()`, which sorts by current UTC offset — so it moved at every DST
 * boundary and a clean checkout generated a 111 KB no-op migration.
 *
 * When this goes red, the list changed. Regenerate it deliberately and ship the
 * migration in the same PR. Never update the digest to match a diff you have not
 * read: `pnpm db:migrations:create` will drop and recreate five enum types.
 */
const PINNED_LENGTH = 581
const PINNED_DIGEST = 'd5f89148e2258cfad4284c3dfc0ea559b0a589ff0cd3f23cccd76c313942face'

const digestOf = (values: string[]) => createHash('sha256').update(values.join('\n')).digest('hex')

describe('SUPPORTED_TIMEZONES', () => {
  const options = SUPPORTED_TIMEZONES

  afterEach(() => {
    vi.doUnmock('@vvo/tzdb')
    vi.resetModules()
  })

  it('pins the exact member list, because the order is baked into five Postgres enums', () => {
    const values = options.map((o) => o.value)
    expect(values.length).toBe(PINNED_LENGTH)
    expect(digestOf(values)).toBe(PINNED_DIGEST)
  })

  it('orders zones by raw offset, so the list never moves with a DST boundary', () => {
    // Only the tzdb loop is sorted. `UTC` and Payload's curated `defaultTimezones`
    // are seeded ahead of it on purpose, to keep their friendlier labels, so they
    // are excluded here rather than asserted out of order.
    const seededFirst = new Set(['UTC', ...defaultTimezones.map((t) => t.value)])
    // `rawOffsetInMinutes` is fixed for a zone. `currentTimeOffsetInMinutes` is not.
    const rank = new Map(getTimeZones().map((z) => [z.name, z.rawOffsetInMinutes]))
    const offsets = options
      .filter((o) => !seededFirst.has(o.value))
      .map((o) => rank.get(o.value))
      .filter((n): n is number => n !== undefined)

    expect(offsets.length).toBeGreaterThan(250)
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1])
    }
  })

  it('ignores the order getTimeZones() happens to return', async () => {
    // The real defect: the list inherited its input's order. Feeding the same
    // zones back reversed must change nothing at all.
    const reversed = [...getTimeZones()].reverse()
    vi.doMock('@vvo/tzdb', () => ({ getTimeZones: () => reversed }))
    vi.resetModules()

    const { SUPPORTED_TIMEZONES: shuffled } = await import('@/lib/timezones')

    // Deliberately NOT compared against the pinned digest — that is the case
    // above. This one fails only when the input's order leaks into the output.
    expect(shuffled.map((o) => o.value)).toEqual(options.map((o) => o.value))
  })

  it('returns the bundled IANA zone set', () => {
    expect(options.length).toBeGreaterThan(40)
  })

  it('gives every option a non-empty IANA value and label', () => {
    for (const option of options) {
      expect(option.value.length).toBeGreaterThan(0)
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  it('includes well-known IANA zone values', () => {
    const values = options.map((o) => o.value)
    expect(values).toContain('Europe/London')
    expect(values).toContain('America/New_York')
    expect(values).toContain('Asia/Tokyo')
  })

  it('has unique values', () => {
    const values = options.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
  })
})
