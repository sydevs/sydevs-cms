/**
 * CLDR plural categories a translation key expands into when `plural: true`.
 *
 * The union across the app's locales (English needs only one/other; Russian,
 * Ukrainian, and Czech add few/many). `EMAIL_STRING_DEFAULTS` must define the
 * whole family for every plural key in the `emails` group, else `withDefaults`
 * drops a translated form — a guard test in `translations-field.int.spec.ts`
 * enforces that sync against this exported constant.
 *
 * It lives here, rather than in `@/fields/translationsField`, because three
 * unrelated owners read it: the field builder (storage keys), the schema walker
 * (which keys a locale must populate), and the email resolver.
 */
export const PLURAL_CATEGORIES = ['one', 'few', 'many', 'other'] as const

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number]

/** The storage keys one declared `plural: true` key expands into. */
export function pluralStorageKeys(key: string): string[] {
  return PLURAL_CATEGORIES.map((category) => `${key}_${category}`)
}
