import type { APIRequestContext, APIResponse } from '@playwright/test'

import { readFileSync } from 'node:fs'

/**
 * Fixtures a smoke spec builds for itself, and the bin that removes them again.
 *
 * **A per-PR preview carries no content.** Railway forks service configuration
 * and variables, not volume data, so a PR environment boots with migrations
 * applied and exactly one row anywhere: the admin `src/plugins/previewAdmin`
 * reconciles on every boot. Every content table is empty on every PR (#704).
 *
 * That is why a spec must not read a list and skip when it comes back empty —
 * the condition holds on every run, so the spec never asserts anything while
 * the job stays green. Each spec creates its own dependencies instead.
 *
 * Records are prefixed with `runId()` by their callers so two runs against the
 * same preview cannot collide on a name or an upload filename.
 */

const image = readFileSync('tests/files/image-1050x700.png')

type Doc = { id: number | string }
type DocResponse = { doc: Doc }

export type Id = number | string

/**
 * Reads the body once and reports it. A create failure here is a broken
 * deployment, not a reason to skip, so it must say what the API answered.
 */
async function created(res: APIResponse, what: string): Promise<Id> {
  if (!res.ok()) {
    throw new Error(
      `smoke fixture: creating the ${what} failed: ${res.status()} ${await res.text()}`,
    )
  }
  const body = (await res.json()) as DocResponse
  if (body.doc?.id === undefined) {
    throw new Error(`smoke fixture: creating the ${what} returned no id: ${JSON.stringify(body)}`)
  }
  return body.doc.id
}

/**
 * A bin of records to delete, emptied newest-first in a spec's `finally`.
 *
 * Deletes are best-effort: a record the spec already removed answers 404, and a
 * cascade (Albums deletes its Songs) may have taken one out from under us.
 * Neither is a failure — the assertions live in the spec, not here.
 */
export function createTrash(request: APIRequestContext, headers: Record<string, string>) {
  const refs: Array<{ collection: string; id: Id }> = []
  return {
    track(collection: string, id: Id): Id {
      refs.push({ collection, id })
      return id
    },
    async empty(): Promise<void> {
      for (const ref of [...refs].reverse()) {
        try {
          await request.delete(`/api/${ref.collection}/${ref.id}`, { headers })
        } catch {
          // Teardown never fails a spec — the deployment already answered the
          // assertions, and a leaked record is namespaced by SMOKE_RUN_ID.
        }
      }
    },
  }
}

/**
 * Upload an Image. `tags` matters for a Meditation thumbnail: `mediaField`
 * builds `filterOptions: { tags: { contains: tagName } }` for a tagged field
 * (`src/fields/mediaField.ts`), and the Meditations thumbnail is tagged
 * `meditation`.
 */
export async function createImage(
  request: APIRequestContext,
  headers: Record<string, string>,
  name: string,
  tags: string[] = [],
): Promise<Id> {
  const res = await request.post('/api/images', {
    headers,
    multipart: {
      _payload: JSON.stringify({ alt: name, ...(tags.length > 0 ? { tags } : {}) }),
      file: { name: `${name}.png`, mimeType: 'image/png', buffer: image },
    },
  })
  return created(res, 'image')
}

/** Create an Album. `artwork`, `title` and `artist` are all required. */
export async function createAlbum(
  request: APIRequestContext,
  headers: Record<string, string>,
  { title, artist, artwork }: { title: string; artist: string; artwork: Id },
): Promise<Id> {
  const res = await request.post('/api/albums', {
    headers: { ...headers, 'content-type': 'application/json' },
    data: { title, artist, artwork },
  })
  return created(res, 'album')
}

/** Create a Narrator. `name` and `gender` are the whole collection. */
export async function createNarrator(
  request: APIRequestContext,
  headers: Record<string, string>,
  name: string,
): Promise<Id> {
  const res = await request.post('/api/narrators', {
    headers: { ...headers, 'content-type': 'application/json' },
    data: { name, gender: 'female' },
  })
  return created(res, 'narrator')
}

/**
 * Upload a Frame. Frames is an upload collection that accepts `image/png`, and
 * requires `imageSet` plus `label` — `label` stays required even though the
 * admin only shows it for a frame with no `subtleSystemNode`.
 */
export async function createFrame(
  request: APIRequestContext,
  headers: Record<string, string>,
  label: string,
): Promise<Id> {
  const res = await request.post('/api/frames', {
    headers,
    multipart: {
      _payload: JSON.stringify({ imageSet: 'female', label }),
      file: { name: `${label}.png`, mimeType: 'image/png', buffer: image },
    },
  })
  return created(res, 'frame')
}
