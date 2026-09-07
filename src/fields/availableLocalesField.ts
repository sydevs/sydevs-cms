import type { PayloadRequest, SelectField } from 'payload'

import { select as validateSelect } from 'payload/shared'

import type { LocaleCode } from '@/lib/locales'
import { DEFAULT_LOCALE, getLocaleLabel, getLocaleOptions } from '@/lib/locales'
import { parseAvailableLocales } from '@/lib/translations/availableLocales'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'

/**
 * `req.context` key for the per-request publish-status read, one per global.
 * The two config globals never share a request, but keying by slug keeps the
 * field reusable on a third.
 */
function memoKey(slug: string): string {
  return `translations:status:${slug}`
}

/**
 * `req.context` flag that skips the publish check.
 *
 * For the **local API only** — seeds and specs that create a config row before
 * anything is published, and would otherwise have to publish 19 locales to save
 * one field. `en` stays required either way, so the flag relaxes the check that
 * needs data, never the invariant.
 */
export const SKIP_AVAILABLE_LOCALES_CHECK = 'skipAvailableLocalesCheck'

/**
 * Read the translations global's per-locale publish status once per request.
 *
 * `locale: 'all'` is what makes one query answer every locale: Payload returns
 * the raw per-locale map for a localized field rather than resolving one
 * (`dist/fields/hooks/afterRead/promise.js`). It also removes the English
 * fallback from the answer — a single-locale read of an untranslated locale
 * would resolve `_status` to English's and report a locale published that has
 * no rows at all.
 */
async function readPublishStatus(
  req: PayloadRequest,
  translationsSlug: string,
): Promise<unknown> {
  const global = await req.payload.findGlobal({
    slug: translationsSlug as Parameters<typeof req.payload.findGlobal>[0]['slug'],
    locale: 'all',
    fallbackLocale: false,
    depth: 0,
    draft: false,
    overrideAccess: true,
    req: localeIsolatedReq(req),
  })
  return (global as { _status?: unknown })._status
}

/**
 * Which of `locales` are not published, given whatever `_status` came back.
 *
 * A **map** is the `localizeStatus` shape: one status per locale. A plain
 * **string** is a global without the flag, where publish state is
 * all-or-nothing — so the field stays usable on `wm-app-config` later, before
 * that global opts in.
 */
export function unpublishedLocales(status: unknown, locales: LocaleCode[]): LocaleCode[] {
  if (typeof status === 'string') return status === 'published' ? [] : [...locales]
  if (typeof status !== 'object' || status === null) return [...locales]
  const map = status as Record<string, unknown>
  return locales.filter((locale) => map[locale] !== 'published')
}

/** "French", "French and German", "French, German and Dutch". */
function listLabels(locales: LocaleCode[]): string {
  const labels = locales.map((locale) => getLocaleLabel(locale))
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

export interface AvailableLocalesFieldOptions {
  /** The translations global whose publish status gates this set. */
  translationsSlug: string
  /** How the surface is named in the error messages, e.g. "the atlas". */
  surface: string
  description?: string
}

/**
 * The set of languages a web project offers.
 *
 * Two invariants, and each is here rather than in a consumer because a stored
 * value that breaks one is a wrong `hreflang` on every page:
 *
 * 1. **`en` is always available.** Every other locale falls back to it.
 * 2. **A locale can only be offered once its translations are published in
 *    it.** Otherwise the SEO cluster promises a crawler a page in a language
 *    the CMS renders as English.
 *
 * Supplying `validate` replaces Payload's built-in one, so this composes the
 * built-in `select` validator (required, option membership, duplicates) rather
 * than reimplementing it.
 */
export function availableLocalesField({
  description,
  surface,
  translationsSlug,
}: AvailableLocalesFieldOptions): SelectField {
  return {
    name: 'availableLocales',
    label: 'Available languages',
    type: 'select',
    hasMany: true,
    required: true,
    options: getLocaleOptions(),
    admin: {
      description:
        description ??
        `Languages ${surface} is offered in. A language can only be selected once its ` +
          'translations are published in it — publish the translations global in that ' +
          'language first. Publishing all locales at once includes empty ones, so publish ' +
          'deliberately.',
    },
    validate: async (value, args) => {
      const builtIn = validateSelect(value, args)
      if (builtIn !== true) return builtIn

      const locales = parseAvailableLocales(value)
      if (!locales.includes(DEFAULT_LOCALE)) {
        return 'English must always be available — every other language falls back to it.'
      }

      const req = args.req as PayloadRequest | undefined
      if (!req) return true
      if (req.context?.[SKIP_AVAILABLE_LOCALES_CHECK] === true) return true

      const status = await memoizeOnRequest(req, memoKey(translationsSlug), () =>
        readPublishStatus(req, translationsSlug),
      )
      const missing = unpublishedLocales(status, locales)
      if (missing.length === 0) return true

      return missing.length === 1
        ? `Publish the ${listLabels(missing)} translations before offering ${listLabels(missing)}.`
        : `Publish the translations for ${listLabels(missing)} before offering them.`
    },
  }
}
