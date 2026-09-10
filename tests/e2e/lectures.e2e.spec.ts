import { expect, test } from '@playwright/test'

import { createTrash } from './_helpers/fixtures'
import { authHeaders, ensureAdmin } from './_helpers/preview'
import { runId } from './_helpers/runId'

type LectureDoc = {
  id: number | string
  type: 'full' | 'clip'
  fullLecture?: number | string | { id: number | string } | null
  nirmalVidyaVimeoUrl?: string | null
}

/**
 * The Lecture fixture is the one that leaves the deployment, and that is a
 * decision rather than an oversight (#704).
 *
 * A preview forks no data, so this spec has to build its own parent full
 * lecture — and `populateFromNirmalaVidya` fetches `mapi.nirmalavidya.org` on
 * every full-lecture create, with no bypass
 * (`src/lib/lectures/nirmalaVidyaApi.ts`). Creating the clip with
 * `nirmalVidyaVimeoUrl` instead of `fullLecture` makes that one create cover
 * both hooks: `resolveClipParent` looks the parent up by URL, creates it when
 * missing, and nulls the URL on the clip.
 *
 * The cost is a third party in the smoke lane's critical path, so an NV failure
 * is reported as an NV failure — see `explainCreateFailure` below. It is not
 * a skip: a skip is what made this spec vacuous in the first place.
 */

/**
 * The lecture this spec builds its parent from.
 *
 * ⚠ **Its one assumption is that NV still serves this video**, and that is the
 * one thing no local check can settle: `mapi.nirmalavidya.org` answers 401 to
 * an unkeyed request, so a valid ID and an invalid one look identical from
 * outside the deployment. The ID comes from the vimeo blocks in
 * `seeds/wemeditate/data.json` — the set `seeds/wemeditate/import.ts` turns
 * into Lectures through this same hook — and a preview CI run is what confirms
 * it.
 *
 * Override with `SMOKE_LECTURE_VIMEO_URL` when NV stops serving this one. Any
 * lecture NV still knows will do: nothing else in the spec depends on which.
 */
const LECTURE_VIMEO_URL = process.env.SMOKE_LECTURE_VIMEO_URL ?? 'https://vimeo.com/354365984'

/**
 * `populateFromNirmalaVidya` wraps every upstream failure as a ValidationError
 * reading `Could not fetch lecture data from Nirmala Vidya: …`, and reports a
 * missing key as `NIRMALA_VIDYA_API_KEY is not configured`. Both name the
 * service, which is what separates "the third party is unavailable" from "this
 * PR broke Lectures".
 */
function explainCreateFailure(status: number, body: string): string {
  if (body.includes('Nirmala Vidya') || body.includes('NIRMALA_VIDYA_API_KEY')) {
    return [
      `Creating the lecture clip failed because the Nirmala Vidya API did not answer for ${LECTURE_VIMEO_URL}.`,
      'NV is the one third-party dependency in this lane, accepted deliberately: a full lecture',
      'cannot be created without it. It is NOT evidence that this PR broke the Lectures collection.',
      '',
      'Check, in order: mapi.nirmalavidya.org is up; NIRMALA_VIDYA_API_KEY is set on the preview',
      'service; NV still serves this video. Point the spec at another lecture with',
      'SMOKE_LECTURE_VIMEO_URL if the last one is what changed.',
      '',
      `Response: ${status} ${body}`,
    ].join('\n')
  }
  return `Creating the lecture clip failed: ${status} ${body}`
}

test('create, update, and delete a Lecture clip against preview', async ({ request }, testInfo) => {
  const token = await ensureAdmin(request)
  const headers = authHeaders(token)
  const jsonHeaders = { ...headers, 'content-type': 'application/json' }
  const trash = createTrash(request, headers)

  const clipTitle = `smoke-${runId()}-lecture-clip-r${testInfo.retry}`

  try {
    const createRes = await request.post('/api/lectures', {
      headers: jsonHeaders,
      data: {
        type: 'clip',
        nirmalVidyaVimeoUrl: LECTURE_VIMEO_URL,
        title: clipTitle,
        startTime: 0,
        stopTime: 30,
      },
    })
    if (!createRes.ok()) {
      throw new Error(explainCreateFailure(createRes.status(), await createRes.text()))
    }

    const created = (await createRes.json()) as { doc: LectureDoc }
    expect(created.doc.type).toBe('clip')

    // `resolveClipParent` resolved the parent from the URL and nulled the URL
    // on the clip — the half of the flow a supplied `fullLecture` would skip.
    const parent = created.doc.fullLecture
    const parentId = typeof parent === 'object' && parent !== null ? parent.id : parent
    expect(parentId, 'the clip should have had a parent resolved from its Vimeo URL').toBeTruthy()
    expect(created.doc.nirmalVidyaVimeoUrl ?? null).toBeNull()

    // Parent first, so the bin empties newest-first: clip, then parent.
    if (parentId != null) trash.track('lectures', parentId)
    const id = trash.track('lectures', created.doc.id)

    const updateRes = await request.patch(`/api/lectures/${id}`, {
      headers: jsonHeaders,
      data: { startTime: 5 },
    })
    expect(updateRes.ok(), `update failed: ${updateRes.status()} ${await updateRes.text()}`).toBe(
      true,
    )

    const deleteRes = await request.delete(`/api/lectures/${id}`, { headers })
    expect(deleteRes.ok()).toBe(true)

    const after = await request.get(`/api/lectures/${id}`, { headers })
    expect(after.status()).toBe(404)
  } finally {
    await trash.empty()
  }
})
