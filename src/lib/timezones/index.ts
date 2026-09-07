import { getTimeZones } from '@vvo/tzdb'
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
 * ⚠ **The order is part of the contract, so we impose it here rather than
 * inherit it.** `getTimeZones()` returns its zones sorted by
 * `currentTimeOffsetInMinutes`, which moves at every DST boundary in any zone
 * this list covers. That made the enum member order a function of the *date the
 * migration was generated*: a clean checkout generated a 111 KB migration that
 * dropped and recreated all five `*_tz` enums to reorder them, with no schema
 * change at all (#722). We sort on `rawOffsetInMinutes`, which is fixed for a
 * zone, and break ties on `name`. That also matches the label — `rawFormat` is
 * the raw offset, so before this fix `Pacific/Easter` read `(-06:00)` while
 * sitting in the `-05:00` group for half the year.
 *
 * `SUPPORTED_TIMEZONES` is pinned by `tests/unit/timezone-options.spec.ts`. Change the
 * membership or the order and that spec goes red — which is the point, because
 * the alternative is finding out from a migration diff.
 */
export const SUPPORTED_TIMEZONES: TimezoneOption[] = (() => {
  const byValue = new Map<string, TimezoneOption>()
  // `@vvo/tzdb` omits plain `UTC`; seed it as a first-class option.
  byValue.set('UTC', { label: '(UTC+00:00) Coordinated Universal Time', value: 'UTC' })
  for (const { label, value } of defaultTimezones) {
    if (!byValue.has(value)) byValue.set(value, { label, value })
  }
  // Sort defensively: never trust `getTimeZones()`'s own order. See the note above.
  // The tie-break compares code units, NOT `localeCompare` — collation varies with
  // the host's ICU version, which is the same class of bug this module avoids by
  // not using `Intl.supportedValuesOf`. IANA names are ASCII, so this is total.
  const zones = [...getTimeZones()].sort(
    (a, b) => a.rawOffsetInMinutes - b.rawOffsetInMinutes || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
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
