// The seam that used to be HTTP.
//
// Same call signatures as the old fetch-based client, so the components above
// did not have to change -- but everything now runs in the page against a local
// GameSession, and nothing leaves the device.  No server, no account, no
// hosting bill, and the app works with the network off.

import { GameSession } from '../../src/io/session.js'
import * as storage from '../../src/io/storage.js'
import { validatePack } from '../../src/pack/validate.js'
import { slugify, uniqueSlug, emptyPackTemplate } from '../../src/pack/schema.js'
import examplePack from '../../packs/example/pack.json'

export const bundledPacks = [examplePack]

// Bundled packs plus whatever the author has built or imported. Bundled packs
// never enter the packs store themselves -- duplicating one in the builder is
// what gives it a stored, editable copy under a fresh id.
async function allPacks () {
  return [...bundledPacks, ...(await storage.listUserPacks())]
}

let session = null

function active () {
  if (!session) throw new Error('no game loaded')
  return session
}

export const api = {
  // ── Library ───────────────────────────────────────────────────────────────

  listGames: () => storage.listGames(),

  async listPacks () {
    const packs = await allPacks()
    return packs.map(pack => {
      const { ok, errors, warnings, info } = validatePack(pack)
      return {
        id: pack.manifest.id,
        name: pack.manifest.name,
        version: pack.manifest.version,
        description: pack.manifest.description ?? '',
        systemTag: pack.manifest.systemTag ?? null,
        license: pack.manifest.license ?? null,
        attribution: pack.manifest.attribution ?? '',
        origin: bundledPacks.includes(pack) ? 'bundled' : 'user',
        ok,
        errors,
        warnings,
        info
      }
    })
  },

  async createGame ({ name, packId, seed, cellChoiceMode } = {}) {
    const packs = await allPacks()
    const pack = packs.find(p => p.manifest.id === packId) ?? packs[0]

    const { ok, errors } = validatePack(pack)
    if (!ok) {
      throw new Error(`pack "${pack.manifest.id}" is not playable: ${errors[0].message}`)
    }

    session = await GameSession.create(pack, { name, seed, cellChoiceMode })
    return {
      gameId: session.gameId,
      name: session.name,
      roomContext: session.getState(),
      parties: session.getParties()
    }
  },

  async openGame (gameId) {
    session = await GameSession.open(gameId)
    return {
      gameId: session.gameId,
      name: session.name,
      roomContext: session.getState(),
      parties: session.getParties()
    }
  },

  closeGame () {
    session = null
  },

  async deleteGame (gameId) {
    if (session?.gameId === gameId) session = null
    await storage.deleteGame(gameId)
    return storage.listGames()
  },

  exportGame: () => storage.exportGame(active().save),

  async importGame (json) {
    const save = await storage.importGame(json)
    return storage.summarize(save)
  },

  // ── Pack builder ────────────────────────────────────────────────────────

  listUserPacks: () => storage.listUserPacks(),

  async loadPackDraft (id) {
    const bundled = bundledPacks.find(p => p.manifest.id === id)
    return bundled ?? storage.loadUserPack(id)
  },

  // Pure and synchronous -- safe to call on every keystroke while editing.
  validateDraft: (json) => validatePack(json),

  async createPackDraft ({ fromId, name } = {}) {
    const base = fromId ? structuredClone(await this.loadPackDraft(fromId)) : emptyPackTemplate(name)
    const taken = new Set((await storage.listUserPacks()).map(p => p.manifest.id))
    const id = uniqueSlug(slugify(name || base.manifest.name), taken)
    const now = new Date().toISOString()

    const draft = {
      ...base,
      manifest: { ...base.manifest, id, name: name || base.manifest.name },
      createdAt: now,
      lastModified: now,
      version: 1
    }
    await storage.putUserPack(draft)
    return draft
  },

  async savePackDraft (json) {
    // manifest.id is the store's keyPath and is user-editable in the builder,
    // so a rename must delete the old row rather than leaving an orphan.
    if (json.__previousId && json.__previousId !== json.manifest.id) {
      await storage.deleteUserPack(json.__previousId)
    }
    const { __previousId, ...pack } = json
    const saved = {
      ...pack,
      lastModified: new Date().toISOString(),
      version: (pack.version ?? 0) + 1
    }
    await storage.putUserPack(saved)
    return saved
  },

  deleteUserPack: (id) => storage.deleteUserPack(id),

  exportPackDraft: (json) => storage.exportPack(json),

  importPackDraft: (json) => storage.importUserPack(json),

  // ── Play ──────────────────────────────────────────────────────────────────

  getState: async (partyId) => active().getState(partyId),
  getCatalog: async (partyId) => active().getCatalog(partyId),
  getDoors: async (partyId) => active().getDoors(partyId),
  getParties: async () => active().getParties(),
  getPreviewChoices: async (targetCell) => active().getPreviewChoices(targetCell),
  openDoor: (doorIndex, targetCell, partyId) => active().openDoor(doorIndex, targetCell, partyId),
  command: (command, options) => active().command(command, options),
  setRoomFlag: (flag, value, target) => active().setRoomFlag(flag, value, target),
  rewindTo: (count) => active().command('rewind', { count }),
  addNote: (text, partyId) => active().addNote(text, partyId),

  setActiveParty: (partyId) => active().setActiveParty(partyId),
  splitParty: (partyId, options) => active().splitParty(partyId, options),
  mergeParty: (fromId, intoId) => active().mergeParty(fromId, intoId),
  renameParty: (partyId, name) => active().renameParty(partyId, name),
  setPartyNotes: (partyId, notes) => active().setPartyNotes(partyId, notes),
  getEventLog: async (limit) => active().getEventLog(limit),
  setCellChoiceMode: (mode) => active().setCellChoiceMode(mode),
  applyReset: (event) => active().applyReset(event),

  currentGame: () => session && {
    gameId: session.gameId,
    name: session.name,
    seed: session.save.seed,
    pack: session.save.pack,
    cellChoiceMode: session.engine.gameDetails.cellChoiceMode,
    resetEvents: session.engine.gameDetails.packResetEvents ?? []
  },

  // Cell colours, so the party bar can show which keys a group carries.
  cells: () => session && Object.fromEntries(
    Object.entries(session.engine.cells).map(([id, c]) => [
      id, { color: c.color, colorName: c.colorName }
    ])
  )
}
