import { rawTimeZones } from '@vvo/tzdb'
import { defaultTimezones } from 'payload/shared'

export interface TimezoneOption {
  label: string
  value: string
}

/**
 * The full IANA timezone set, sourced deterministically from the **pinned**
 * `@vvo/tzdb` package (its bundled tz database). We do NOT use
 * `Intl.supportedValuesOf('timeZone')`: every `timezone: true` companion field
 * bakes a Postgres enum from this list,
 * so it MUST be identical on the machine that generates the migration and on
 * every runtime — and `Intl` varies with the host's ICU version (e.g.
 * `Asia/Calcutta` vs `Asia/Kolkata`). A pinned package is identical everywhere.
 *
 * Built once at module load: Payload's curated `defaultTimezones` first (keeping
 * their friendly labels), then every `@vvo/tzdb` zone **and its aliases** — so
 * legacy IANA names the Atlas data uses (`Europe/Kiev`, `Australia/Melbourne`,
 * `America/Belem`, …) resolve, not just the canonical `Europe/Kyiv` /
 * `Australia/Sydney`. Bumping `@vvo/tzdb` widens the enums → needs a migration.
 *
 * ⚠ **Both the membership and the ORDER are schema, so we take neither from a
 * function of the host or the clock** (#722).
 *
 * - **Order.** `getTimeZones()` returns its zones sorted by
 *   `currentTimeOffsetInMinutes`, which moves at every DST boundary in any zone
 *   this list covers. That made the enum member order a function of the *date
 *   the migration was generated*: a clean checkout generated a 111 KB migration
 *   that dropped and recreated all five `*_tz` enums to reorder them, with no
 *   schema change at all. We sort on `rawOffsetInMinutes`, fixed for a zone.
 *   Sorting also aligns the list with its own label — we render `rawFormat`, so
 *   before this fix `Pacific/Easter` was labelled `-06:00 Easter Island Time …`
 *   while sitting in the `-05:00` group for half the year.
 * - **Membership.** We read the static `rawTimeZones`, not `getTimeZones()`.
 *   `getTimeZones()` resolves every zone through `Intl` and **silently drops**
 *   any the host's ICU cannot format (`getTimeZones.js` returns the accumulator
 *   unchanged when the offset lookup throws). An older runtime would therefore
 *   build a *shorter* enum — the very `Intl` dependency the paragraph above
 *   disclaims. `rawTimeZones` carries all four fields used here, so this costs
 *   nothing: the list is byte-identical on this runtime.
 *
 * `SUPPORTED_TIMEZONES` is pinned by `tests/unit/timezone-options.spec.ts`.
 * Change the membership or the order and that spec goes red — which is the
 * point, because the alternative is finding out from a migration diff.
 */
export const SUPPORTED_TIMEZONES: TimezoneOption[] = (() => {
  const byValue = new Map<string, TimezoneOption>()
  // `@vvo/tzdb` omits plain `UTC`; seed it as a first-class option.
  byValue.set('UTC', { label: '(UTC+00:00) Coordinated Universal Time', value: 'UTC' })
  for (const { label, value } of defaultTimezones) {
    if (!byValue.has(value)) byValue.set(value, { label, value })
  }
  // Impose the order; never inherit one. See the note above.
  // The tie-break compares code units, NOT `localeCompare` — collation varies with
  // the host's ICU version, which is the same class of bug this module avoids by
  // not using `Intl.supportedValuesOf`. IANA names are ASCII, so this is total:
  // every (rawOffsetInMinutes, name) pair is unique, so no tie ever falls through
  // to `sort`'s own stability and the input order cannot leak into the output.
  const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  const zones = [...rawTimeZones].sort(
    (a, b) => a.rawOffsetInMinutes - b.rawOffsetInMinutes || byName(a.name, b.name),
  )
  for (const zone of zones) {
    for (const value of [zone.name, ...zone.group]) {
      if (!byValue.has(value)) byValue.set(value, { label: zone.rawFormat, value })
    }
  }
  // `@vvo/tzdb` also omits the POSIX `Etc/GMT*` zones (the Atlas registrations
  // carry e.g. `Etc/GMT-3`). Add the full range. The name's sign is inverted
  // from the offset (`Etc/GMT-3` is UTC+3), so the label shows the real offset.
  for (let offset = -14; offset <= 12; offset++) {
    const value = offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset < 0 ? offset : `+${offset}`}`
    const sign = offset >= 0 ? '+' : '-'
    const hh = String(Math.abs(offset)).padStart(2, '0')
    if (!byValue.has(value)) byValue.set(value, { label: `(UTC${sign}${hh}:00) ${value}`, value })
  }
  return [...byValue.values()]
})()
