// The pack format: the unit of distributable content.
//
// A pack supplies *content* -- authored rooms.  The generator supplies
// *instances* -- the 40 occupants of the dungeon.  Keeping those separate is
// what lets a pack ship fewer than 40 rooms and still fill a penteract, by
// repeating content under different variants and cell colors.
//
// The engine reads only the fields marked ENGINE below.  Everything else is
// opaque text it hands to the UI, and anything genuinely system-specific lives
// under `system`, which the engine is structurally incapable of branching on.
// That is what "system agnostic" means here in practice: the geometry never
// learns what d20 is.

import { CELL_COUNT } from '../engine/topology.js'

export const PACK_SCHEMA_VERSION = 1

export const GRAVITY_TYPES = ['Fixed', 'Random', 'Match', 'Special']
export const ROOM_ROLES = ['start', 'exit']
export const FILLER_STRATEGIES = ['templates', 'reuse', 'mixed']
export const FILLER_DISTRIBUTIONS = ['spread', 'random']

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/

// What a creature or feature comes back from. An open vocabulary the reset
// system consumes; a room declares which events restore each thing it holds.
export const RESET_EVENTS = ['short-rest', 'long-rest', 'key', 'doors', 'shuffle']

// `kind` on a feature is descriptive, not behavioural -- the engine never
// branches on it, it only groups things for the GM's eye.
export const FEATURE_KINDS = ['hazard', 'treasure', 'key', 'lever', 'lore', 'other']

export const REST_SAFETY = ['safe', 'unsafe', 'special']

// What a party can *do* in a room, and therefore what a reset can undo.
//
// These are not free-text notes. A note records what happened; an action records
// a state the room is in, which is the only form a reset event can act on
// programmatically. Every creature and every feature a room declares becomes one
// automatically -- the pack already lists them, so listing them twice would be
// the thing that drifts.
export const FEATURE_VERBS = {
  hazard: 'disarmed',
  treasure: 'taken',
  key: 'taken',
  lever: 'used',
  lore: 'read',
  other: 'dealt with'
}

// Room-level actions every room offers unless the pack says otherwise.
export const PACK_ACTION_DEFAULTS = [
  { id: 'searched', label: 'searched', resetsOn: [] }
]

// Namespaced so a creature called "searched" cannot collide with the room-level
// action of the same name.
export const ACTION_PREFIX = { creature: 'creature:', feature: 'feature:' }

export const LINK_KINDS = ['statblock', 'map', 'vtt', 'doc', 'image', 'other']

// Text templating: {{key}} tokens in read/detail/gm/orientation/onKey text,
// substituted at display time (see roomView.js). `cellColor` is always
// available (the tesseract the room is currently resolved into); a pack may
// declare its own on top, e.g. {{bigBadName}}. `variant` is reserved -- it is
// a *different*, earlier-stage substitution (see load.js) already spent by
// the time a room reaches display, so a pack cannot redeclare it here.
export const TEMPLATE_VAR_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/
export const BUILTIN_TEMPLATE_VARS = ['cellColor']
export const RESERVED_TEMPLATE_VARS = ['variant']

// Cells hold 8 rooms, so a co-location group cannot exceed 8.  A room occupies
// 2 of the 10 cells, so at most 5 rooms can be pairwise cell-disjoint.
export const MAX_INCLUDE_GROUP = 8
export const MAX_EXCLUDE_GROUP = 5

// ── Room defaults ───────────────────────────────────────────────────────────

export const ROOM_DEFAULTS = {
  name: 'Unnamed Room',

  // The GM's reading order: what to say, what to say if asked, what to know.
  // Splitting these is what lets the UI put read-aloud text in front of a GM
  // without the rest of the room's truth attached to it.
  read: '', //         safe to read to the players verbatim
  detail: '', //       what a closer look reveals, narrated on request
  gm: '', //           what is actually going on; never read aloud
  orientation: '', //  the room's spatial gimmick -- this app's whole subject

  creatures: [], //    [{ id, name, count, notes, link, resetsOn[] }]
  features: [], //     [{ id, name, kind, detail, resetsOn[] }]
  rest: null, //       { safety, effect }
  links: [], //        [{ kind, label, url }]
  onKey: null, //      { read, detail, gm } shown once the tesseract's key is held

  size: null,
  system: {},

  gravity: { type: 'Match', gravity: 0, desc: null }, // ENGINE
  role: null, //                                         ENGINE  'start' | 'exit' | null
  keyEligible: false, //                                 ENGINE  may hold a cell's key
  includeGroup: null, //                                 ENGINE  co-locate with same tag
  excludeGroup: null, //                                 ENGINE  never share a cell
  // null means "unset", which is not the same as 1.  An authored room is a
  // singleton by default, but naming it in filler.reusePool is an explicit
  // statement that it may repeat -- and then an unset cap means unlimited
  // rather than one, or `reusePool: "*"` could never draw anything.
  maxInstances: null, //                                 ENGINE  instance cap
  variants: null, //                                     ENGINE  distinguishes repeats
  labelRepeats: true //                                  ENGINE  suffix "(II)" on repeats
}

// Filler exists to be repeated, and is key-eligible by default: a pack that is
// mostly filler would otherwise have nowhere to put its ten keys.
export const FILLER_ROOM_DEFAULTS = {
  ...ROOM_DEFAULTS,
  keyEligible: true
}

export const FILLER_DEFAULTS = {
  strategy: 'reuse',
  templates: [],
  reusePool: '*',
  weights: {},
  distribution: 'spread'
}

// A brand-new draft pack, empty but past the one static gate that a truly
// empty envelope would otherwise fail immediately: the fixed cell-colour
// count. Everything else (no start/exit role yet) is left for the author.
export function emptyPackTemplate (name = 'New Pack') {
  return {
    schemaVersion: PACK_SCHEMA_VERSION,
    manifest: {
      id: slugify(name),
      name,
      version: '0.1.0',
      authors: [],
      license: '',
      attribution: '',
      description: '',
      systemTag: '',
      minEngineSchema: PACK_SCHEMA_VERSION
    },
    cells: {
      colors: Array.from({ length: CELL_COUNT }, (_, i) => ({
        hex: `#${((i + 1) * 0x111111).toString(16).padStart(6, '0')}`,
        name: `Cell ${i + 1}`
      }))
    },
    rooms: {},
    fillerRooms: {},
    filler: { ...FILLER_DEFAULTS },
    actions: PACK_ACTION_DEFAULTS.map(a => ({ ...a })),
    // Pack-authored resetsOn triggers beyond the built-in RESET_EVENTS vocabulary,
    // e.g. a puzzle pack's own "return-to-start". Each needs a GM-facing menu
    // button to actually fire (see AppMenu.jsx) -- authoring the name here only
    // makes it choosable on a creature/feature/action's resetsOn list.
    resetEvents: [],
    // Pack-authored {{key}} substitutions for room text, on top of the
    // always-available {{cellColor}}.
    templateVars: []
  }
}

export function slugify (text, fallback = 'room') {
  const slug = String(text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return SLUG_PATTERN.test(slug) ? slug : fallback
}

// Same normalization as slugify, but never reverts to a fallback -- it always
// returns whatever the input sanitizes to, including ''. `slugify`'s
// snap-back-on-invalid-intermediate-state is right for auto-deriving an id
// from a name field a user isn't directly typing into, but wrong for an id
// field they ARE typing into directly: clearing it to retype, or deleting
// down toward an empty string one character at a time, would otherwise keep
// bouncing back to the old value on every keystroke that isn't itself a
// complete valid slug. Let the validator's existing invalid-id check surface
// the problem instead of the input fighting the user over it.
export function looseSlugify (text) {
  return String(text)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Makes `slug` unique against `taken`, appending -2, -3, ... as needed.
export function uniqueSlug (slug, taken) {
  if (!taken.has(slug)) return slug
  let n = 2
  while (taken.has(`${slug}-${n}`)) n++
  return `${slug}-${n}`
}

const asList = value => (Array.isArray(value) ? value.map(v => ({ ...v })) : [])

export function normalizeRoom (room, defaults = ROOM_DEFAULTS) {
  const gravity = { ...defaults.gravity, ...(room.gravity ?? {}) }

  return {
    ...defaults,
    ...room,
    gravity: {
      type: gravity.type,
      // Only Fixed reads a value; the others compute one at entry time.
      gravity: gravity.type === 'Fixed' ? gravity.gravity : 0,
      desc: gravity.desc ?? null
    },
    // Copied rather than shared: these defaults are module-level, and a room
    // that mutated one would poison every other room in the pack.
    creatures: asList(room.creatures),
    features: asList(room.features),
    links: asList(room.links),
    rest: room.rest ? { ...room.rest } : null,
    onKey: room.onKey ? { ...room.onKey } : null,
    system: { ...(room.system ?? {}) }
  }
}

// ── Instance ids ────────────────────────────────────────────────────────────
// `${contentId}.${ordinal}`, always suffixed even for singletons so every call
// site parses ids the same way and promoting a room to repeatable renumbers
// nothing.  Slugs exclude '.', so the split is unambiguous.

export function instanceId (contentId, ordinal) {
  return `${contentId}.${ordinal}`
}

export function contentIdOf (instance) {
  return String(instance).split('.')[0]
}

export function ordinalOf (instance) {
  return Number(String(instance).split('.')[1] ?? 1)
}

// Suffix distinguishing repeats of one content: "Storage Vault (2)".
//
// Plain digits rather than numerals.  A pack may legitimately instantiate one
// room 38 times, and "Storage Vault (XXXVIII)" is something a GM has to stop
// and decode mid-session -- and capping numerals at XX would mean one dungeon
// showing both "(XX)" and "(21)".
export function repeatLabel (ordinal) {
  return String(ordinal)
}
