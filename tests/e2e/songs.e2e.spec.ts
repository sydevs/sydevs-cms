import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import { createAlbum, createImage, createTrash } from './_helpers/fixtures'
import { authHeaders, ensureAdmin } from './_helpers/preview'
import { runId } from './_helpers/runId'

type Doc = { id: number | string }

const audio = readFileSync('tests/files/audio-42s.mp3')

/**
 * The Song fixture is an Image plus an Album, because `songs.album` is
 * `required: true` and `albums.artwork` is an upload relation to `images`
 * (`src/collections/Songs/Songs.ts`, `src/collections/Albums/Albums.ts`).
 *
 * This spec used to read `/api/albums` and skip when it came back empty. That
 * condition holds on every PR — a preview forks configuration, never data — so
 * the spec ran on no PR at all while the job reported green (#704).
 */
test('create, update, and delete a Song against preview', async ({ request }, testInfo) => {
  const token = await ensureAdmin(request)
  const headers = authHeaders(token)
  const trash = createTrash(request, headers)

  const title = `smoke-${runId()}-song-r${testInfo.retry}`

  try {
    const artwork = trash.track('images', await createImage(request, headers, `${title}-artwork`))
    const album = trash.track(
      'albums',
      await createAlbum(request, headers, {
        title: `${title}-album`,
        artist: `${title}-artist`,
        artwork,
      }),
    )

    // Payload REST upload convention: `_payload` carries the JSON doc, `file` carries the binary.
    // https://payloadcms.com/docs/rest-api/overview#uploads
    const createRes = await request.post('/api/songs', {
      headers,
      multipart: {
        _payload: JSON.stringify({ title, album }),
        file: { name: `${title}.mp3`, mimeType: 'audio/mpeg', buffer: audio },
      },
    })
    expect(createRes.ok(), `create failed: ${createRes.status()} ${await createRes.text()}`).toBe(
      true,
    )
    const created = (await createRes.json()) as { doc: Doc & { title: string } }
    expect(created.doc.title).toBe(title)
    const id = trash.track('songs', created.doc.id)

    const newTitle = `${title}-updated`
    const updateRes = await request.patch(`/api/songs/${id}`, {
      headers: { ...headers, 'content-type': 'application/json' },
      data: { title: newTitle },
    })
    expect(updateRes.ok()).toBe(true)

    const deleteRes = await request.delete(`/api/songs/${id}`, { headers })
    expect(deleteRes.ok()).toBe(true)

    const after = await request.get(`/api/songs/${id}`, { headers })
    expect(after.status()).toBe(404)
  } finally {
    await trash.empty()
  }
})
