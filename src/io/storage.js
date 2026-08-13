// Local-first persistence.
//
// Saves live in the browser's IndexedDB.  There is no server, so there is no
// account, no sync, and nothing of the GM's to leak -- and the app keeps
// working with the network off.
//
// Written against raw IndexedDB rather than a wrapper library: the surface used
// here is small, and a dungeon tool that runs offline should not be carrying a
// dependency it could have written in forty lines.  When IndexedDB is absent
// (node, tests, private-mode edge cases) it falls back to an in-memory map with
// the same interface, so nothing above this file has to care.

import { upgradeSave, SAVE_SCHEMA_VERSION as SAVE_VERSION } from './upgrade.js'

const DB_NAME = 'tde'
const DB_VERSION = 2
const STORE = 'games'
const PACK_STORE = 'packs'

export const SAVE_SCHEMA_VERSION = SAVE_VERSION

// ── Backend ─────────────────────────────────────────────────────────────────

const hasIndexedDb = typeof indexedDB !== 'undefined'

let dbPromise = null

function openDb () {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'gameId' })
        }
        if (!db.objectStoreNames.contains(PACK_STORE)) {
          // Keyed on manifest.id rather than a hoisted top-level id: that is
          // how a pack is identified everywhere else in the codebase, so
          // there is no duplicate id field that could drift out of sync.
          // Consequence: renaming manifest.id is a delete+put, not an
          // in-place update -- unlike gameId, manifest.id is a user-editable
          // form field in the builder.
          db.createObjectStore(PACK_STORE, { keyPath: 'manifest.id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  return dbPromise
}

function transact (storeName, mode, run) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const request = run(tx.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }))
}

const memory = new Map()
const packMemory = new Map()

const backend = hasIndexedDb
  ? {
      get: id => transact(STORE, 'readonly', store => store.get(id)),
      put: save => transact(STORE, 'readwrite', store => store.put(save)).then(() => save),
      remove: id => transact(STORE, 'readwrite', store => store.delete(id)),
      all: () => transact(STORE, 'readonly', store => store.getAll())
    }
  : {
      get: async id => memory.get(id) ?? undefined,
      put: async save => { memory.set(save.gameId, save); return save },
      remove: async id => { memory.delete(id) },
      all: async () => [...memory.values()]
    }

const packBackend = hasIndexedDb
  ? {
      get: id => transact(PACK_STORE, 'readonly', store => store.get(id)),
      put: pack => transact(PACK_STORE, 'readwrite', store => store.put(pack)).then(() => pack),
      remove: id => transact(PACK_STORE, 'readwrite', store => store.delete(id)),
      all: () => transact(PACK_STORE, 'readonly', store => store.getAll())
    }
  : {
      get: async id => packMemory.get(id) ?? undefined,
      put: async pack => { packMemory.set(pack.manifest.id, pack); return pack },
      remove: async id => { packMemory.delete(id) },
      all: async () => [...packMemory.values()]
    }

// ── Save envelope ───────────────────────────────────────────────────────────

export function newGameId () {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `game-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// Wraps a freshly generated dungeon in the fields that make it a save.
//
// `version` and `lastModified` exist so optional cloud sync can be added later
// without a format break: a monotonic counter is what lets two devices work out
// which copy is newer, and lets a conflict be detected rather than silently
// resolved by last-write-wins.
export function newSave (dungeon, name) {
  const now = new Date().toISOString()

  return {
    ...dungeon,
    schemaVersion: SAVE_SCHEMA_VERSION,
    gameId: newGameId(),
    name,
    version: 1,
    createdAt: now,
    lastModified: now
  }
}

export function touchSave (save) {
  return { ...save, version: (save.version ?? 0) + 1, lastModified: new Date().toISOString() }
}

// Summary rows for the game list, newest first. Deliberately does not read the
// full dungeon -- a save is ~60KB and a list of twenty should not cost 1.2MB of
// parsing to render.
export function summarize (save) {
  return {
    gameId: save.gameId,
    name: save.name,
    packName: save.pack?.name ?? null,
    packId: save.pack?.id ?? null,
    seed: save.seed,
    version: save.version,
    createdAt: save.createdAt,
    lastModified: save.lastModified,
    roomName: save.rooms?.[save.gameDetails?.currentRoom]?.name ?? null,
    moves: save.gameDetails?.gameLog?.length ?? 0
  }
}

// ── Operations ──────────────────────────────────────────────────────────────

export async function listGames () {
  const saves = await backend.all()
  return saves
    .map(summarize)
    .sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)))
}

export async function loadGame (gameId) {
  const save = await backend.get(gameId)
  if (!save) throw new Error(`no saved game with id ${gameId}`)
  assertReadable(save)
  // Brought forward on the way in, so nothing downstream knows more than one
  // save shape exists. Not written back until the next persist.
  return upgradeSave(save)
}

export function putGame (save) {
  return backend.put(save)
}

export function deleteGame (gameId) {
  return backend.remove(gameId)
}

function assertReadable (save) {
  const version = save.schemaVersion ?? 0
  if (version > SAVE_SCHEMA_VERSION) {
    throw new Error(
      `save "${save.name ?? save.gameId}" was written by a newer version of the app ` +
      `(schema ${version}, this build reads ${SAVE_SCHEMA_VERSION})`
    )
  }
}

// ── Export / import ─────────────────────────────────────────────────────────
// The zero-infrastructure answer to multi-device: a save is a small JSON file.
// Drop it in a synced folder, mail it to yourself, hand it to the GM taking
// over next session.

export function exportGame (save) {
  return JSON.stringify(save, null, 2)
}

export async function importGame (json, { rename = null } = {}) {
  let save
  try {
    save = typeof json === 'string' ? JSON.parse(json) : json
  } catch (err) {
    throw new Error(`not a valid save file: ${err.message}`)
  }

  if (!save || typeof save !== 'object' || !save.cells || !save.rooms || !save.gameDetails) {
    throw new Error('not a valid save file: missing cells, rooms or gameDetails')
  }
  assertReadable(save)
  save = upgradeSave(save)

  // A save imported twice should become two games rather than overwrite the
  // first -- the GM may be comparing two branches of the same session.
  const existing = save.gameId ? await backend.get(save.gameId) : undefined
  const imported = {
    ...save,
    schemaVersion: save.schemaVersion ?? SAVE_SCHEMA_VERSION,
    gameId: existing ? newGameId() : (save.gameId ?? newGameId()),
    name: rename ?? (existing ? `${save.name} (imported)` : (save.name ?? 'Imported game')),
    version: save.version ?? 1,
    createdAt: save.createdAt ?? new Date().toISOString(),
    lastModified: new Date().toISOString()
  }

  return backend.put(imported)
}

// Test seam: drops the in-memory backend's contents.
export function __resetMemory () {
  memory.clear()
}

// ── User-authored packs ─────────────────────────────────────────────────────
// A second store, same dual-backend shape as games. Only user-authored packs
// ever live here -- the bundled reference pack stays a static import and only
// enters this store if the author explicitly duplicates it.

export async function listUserPacks () {
  const packs = await packBackend.all()
  return packs.sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)))
}

export async function loadUserPack (id) {
  const pack = await packBackend.get(id)
  if (!pack) throw new Error(`no user pack with id ${id}`)
  return pack
}

export function putUserPack (pack) {
  return packBackend.put(pack)
}

export function deleteUserPack (id) {
  return packBackend.remove(id)
}

export function exportPack (pack) {
  return JSON.stringify(pack, null, 2)
}

export async function importUserPack (json) {
  let pack
  try {
    pack = typeof json === 'string' ? JSON.parse(json) : json
  } catch (err) {
    throw new Error(`not a valid pack file: ${err.message}`)
  }

  if (!pack || typeof pack !== 'object' || !pack.manifest || !pack.rooms) {
    throw new Error('not a valid pack file: missing manifest or rooms')
  }

  const now = new Date().toISOString()
  const existing = pack.manifest.id ? await packBackend.get(pack.manifest.id) : undefined

  const imported = {
    ...pack,
    manifest: {
      ...pack.manifest,
      // An import colliding with a stored pack becomes a copy, not an
      // overwrite -- same reasoning as importGame: the author may be
      // comparing two versions of the same pack.
      id: existing ? `${pack.manifest.id}-imported-${Date.now().toString(36)}` : pack.manifest.id,
      name: existing ? `${pack.manifest.name} (imported)` : pack.manifest.name
    },
    createdAt: pack.createdAt ?? now,
    lastModified: now,
    version: pack.version ?? 1
  }

  return packBackend.put(imported)
}

// Test seam: drops the in-memory pack backend's contents.
export function __resetPackMemory () {
  packMemory.clear()
}
