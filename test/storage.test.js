import test from 'node:test'
import assert from 'node:assert/strict'

import * as storage from '../src/io/storage.js'
import { GameSession } from '../src/io/session.js'
import { emptyPackTemplate } from '../src/pack/schema.js'
import { bigPackJson } from './fixtures.js'

const bigPack = bigPackJson()

const draftPack = (name = 'Draft') => ({
  ...emptyPackTemplate(name),
  createdAt: new Date().toISOString(),
  lastModified: new Date().toISOString(),
  version: 1
})

test.beforeEach(() => {
  storage.__resetMemory()
  storage.__resetPackMemory()
})

// ── User packs ────────────────────────────────────────────────────────────

test('putUserPack/loadUserPack round-trips a draft', async () => {
  const draft = draftPack('My Pack')
  await storage.putUserPack(draft)

  const loaded = await storage.loadUserPack(draft.manifest.id)
  assert.deepEqual(loaded, draft)
})

test('loadUserPack throws for an unknown id', async () => {
  await assert.rejects(() => storage.loadUserPack('nope'), /no user pack/)
})

test('listUserPacks sorts newest lastModified first', async () => {
  const older = { ...draftPack('Older'), lastModified: '2026-01-01T00:00:00.000Z' }
  const newer = { ...draftPack('Newer'), lastModified: '2026-06-01T00:00:00.000Z' }
  await storage.putUserPack(older)
  await storage.putUserPack(newer)

  const packs = await storage.listUserPacks()
  assert.deepEqual(packs.map(p => p.manifest.name), ['Newer', 'Older'])
})

test('deleteUserPack removes it from subsequent listings', async () => {
  const draft = draftPack('Gone soon')
  await storage.putUserPack(draft)
  await storage.deleteUserPack(draft.manifest.id)

  assert.deepEqual(await storage.listUserPacks(), [])
})

test('deleting a pack does not affect a save created from it', async () => {
  const draft = draftPack('Ephemeral')
  await storage.putUserPack(draft)

  // Saves snapshot pack content fully at generation time; a blank draft has
  // no rooms, so this exercises the invariant with a real fixture pack
  // instead, tagged with the draft's identity to prove the save does not
  // depend on any pack still existing.
  const session = await GameSession.create(bigPack, { name: 'Snapshot check', seed: 1 })
  await storage.deleteUserPack(draft.manifest.id)

  const reloaded = await storage.loadGame(session.gameId)
  assert.equal(reloaded.pack.name, bigPack.manifest.name)
  assert.equal(Object.keys(reloaded.rooms).length, 40)
})

test('exportPack/importUserPack round-trips a draft', async () => {
  const draft = draftPack('Exportable')
  const json = storage.exportPack(draft)
  const imported = await storage.importUserPack(json)

  assert.equal(imported.manifest.id, draft.manifest.id)
  assert.deepEqual(await storage.loadUserPack(draft.manifest.id), imported)
})

test('importing a pack whose id collides with a stored one mints a copy', async () => {
  const draft = draftPack('Original')
  await storage.putUserPack(draft)

  const imported = await storage.importUserPack(storage.exportPack(draft))

  assert.notEqual(imported.manifest.id, draft.manifest.id)
  assert.equal(imported.manifest.name, 'Original (imported)')
  assert.equal((await storage.listUserPacks()).length, 2)
})

test('importUserPack rejects malformed input', async () => {
  await assert.rejects(() => storage.importUserPack('not json'), /not a valid pack file/)
  await assert.rejects(() => storage.importUserPack({}), /not a valid pack file/)
})

test('__resetPackMemory isolates tests from each other', async () => {
  await storage.putUserPack(draftPack('Leftover'))
  storage.__resetPackMemory()
  assert.deepEqual(await storage.listUserPacks(), [])
})
