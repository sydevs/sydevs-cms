import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { createFrame, createImage, createNarrator, createTrash } from './_helpers/fixtures'
import { authHeaders, ensureAdmin } from './_helpers/preview'
import { runId } from './_helpers/runId'

type Doc = { id: number | string }

const audio = readFileSync('tests/files/audio-42s.mp3')

/**
 * The Meditation fixture is a Narrator, an Image and a Frame: `narrator` and
 * `thumbnail` are required on update, and the `frames` validator demands at
 * least one frame on update (`src/collections/Meditations/Meditations.ts`).
 *
 * This spec used to read those three collections and skip when any came back
 * empty. That condition holds on every PR — a preview forks configuration,
 * never data — so the spec ran on no PR at all while the job reported green
 * (#704).
 */
test('create, update, and delete a Meditation against preview', async ({ request }, testInfo) => {
  const token = await ensureAdmin(request)
  const headers = authHeaders(token)
  const trash = createTrash(request, headers)

  // Retry-aware identifier so Playwright's automatic retries do not trip on
  // meditations_filename_idx (UNIQUE) — a failed first attempt would
  // otherwise leave a row that blocks every retry.
  const label = `smoke-${runId()}-meditation-r${testInfo.retry}`

  try {
    const narrator = trash.track('narrators', await createNarrator(request, headers, label))
    // Tagged `meditation` to satisfy the thumbnail field's filterOptions.
    const thumbnail = trash.track(
      'images',
      await createImage(request, headers, `${label}-thumbnail`, ['meditation']),
    )
    const frame = trash.track('frames', await createFrame(request, headers, `${label}-frame`))

    const payload = {
      label,
      narrator,
      thumbnail,
      locale: 'en',
      type: 'daily',
      frames: [{ id: frame, timestamp: 0 }],
    }

    // Payload REST upload convention: `_payload` carries the JSON doc, `file` carries the binary.
    // https://payloadcms.com/docs/rest-api/overview#uploads
    const createRes = await request.post('/api/meditations', {
      headers,
      multipart: {
        _payload: JSON.stringify(payload),
        file: { name: `${label}.mp3`, mimeType: 'audio/mpeg', buffer: audio },
      },
    })
    expect(createRes.ok(), `create failed: ${createRes.status()} ${await createRes.text()}`).toBe(
      true,
    )
    const created = (await createRes.json()) as { doc: Doc & { label: string } }
    expect(created.doc.label).toBe(label)
    const id = trash.track('meditations', created.doc.id)

    const newLabel = `${label}-updated`
    const updateRes = await request.patch(`/api/meditations/${id}`, {
      headers: { ...headers, 'content-type': 'application/json' },
      data: { label: newLabel },
    })
    expect(updateRes.ok(), `update failed: ${updateRes.status()} ${await updateRes.text()}`).toBe(
      true,
    )
    const updated = (await updateRes.json()) as { doc: { label: string } }
    expect(updated.doc.label).toBe(newLabel)

    const deleteRes = await request.delete(`/api/meditations/${id}`, { headers })
    expect(deleteRes.ok()).toBe(true)

    const after = await request.get(`/api/meditations/${id}`, { headers })
    expect(after.status()).toBe(404)
  } finally {
    await trash.empty()
  }
})
