// Static validation of a pack, run before any attempt to generate.
//
// Never throws -- it returns structured findings, because this is the gate that
// third-party and model-assisted authoring both sit behind, and a stack trace
// is not something either can act on.  Every finding carries a stable `code`, a
// `path` into the pack, and a human `message`.
//
// The distinction that matters:
//
//   errors    the pack cannot produce a dungeon
//   warnings  it can, but something is probably not what the author meant
//   info      descriptive facts about what this pack will produce
//
// Deliberately NOT errors, per the pack design:
//
//   - fewer than 10 key-eligible rooms.  Cells beyond the supply simply hold no
//     key; a pack built around a chase or a hunt may want none at all.
//   - a key-eligible start room.  Handing the party a key in the first room is
//     a legitimate opening, and the reference pack does exactly that.

import { ROOM_COUNT, CELL_COUNT } from '../engine/topology.js'
import {
  PACK_SCHEMA_VERSION, GRAVITY_TYPES, ROOM_ROLES,
  FILLER_STRATEGIES, FILLER_DISTRIBUTIONS, SLUG_PATTERN,
  MAX_INCLUDE_GROUP, MAX_EXCLUDE_GROUP, RESET_EVENTS, REST_SAFETY,
  TEMPLATE_VAR_PATTERN, BUILTIN_TEMPLATE_VARS, RESERVED_TEMPLATE_VARS
} from './schema.js'
import { loadPack, resolveInstances, PackError } from './load.js'
import { makeRng } from '../engine/topology.js'

export function validatePack (json, { count = ROOM_COUNT, cells = CELL_COUNT } = {}) {
  const errors = []
  const warnings = []
  const error = (code, message, path, detail) => errors.push({ code, message, path, detail })
  const warn = (code, message, path, detail) => warnings.push({ code, message, path, detail })

  const done = info => ({ ok: errors.length === 0, errors, warnings, info })

  // ── Envelope ──────────────────────────────────────────────────────────────

  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    error('PACK_NOT_AN_OBJECT', 'pack must be a JSON object', '')
    return done({})
  }

  const schemaVersion = json.schemaVersion ?? 1
  if (schemaVersion > PACK_SCHEMA_VERSION) {
    error(
      'PACK_SCHEMA_UNSUPPORTED',
      `pack declares schemaVersion ${schemaVersion}; this engine reads up to ${PACK_SCHEMA_VERSION}`,
      'schemaVersion', { found: schemaVersion, supported: PACK_SCHEMA_VERSION }
    )
    return done({})
  }

  // ── Manifest ──────────────────────────────────────────────────────────────

  const manifest = json.manifest ?? {}
  for (const field of ['id', 'name', 'version']) {
    if (!manifest[field]) {
      error('MANIFEST_FIELD_MISSING', `manifest.${field} is required`, `manifest.${field}`)
    }
  }
  if (manifest.id && !SLUG_PATTERN.test(manifest.id)) {
    error(
      'MANIFEST_ID_INVALID',
      `manifest.id "${manifest.id}" must be lowercase letters, digits and hyphens`,
      'manifest.id'
    )
  }
  if (/^CC-BY/i.test(manifest.license ?? '') && !manifest.attribution) {
    warn(
      'ATTRIBUTION_MISSING',
      `license is ${manifest.license} but manifest.attribution is empty; ` +
      'CC-BY requires the attribution notice to travel with the work',
      'manifest.attribution'
    )
  }

  // ── Custom reset events ───────────────────────────────────────────────────
  // Pack-authored triggers beyond the built-in RESET_EVENTS vocabulary. Once
  // declared here, an id is valid anywhere a resetsOn list is checked below.

  const customResetEvents = []
  if (json.resetEvents != null) {
    if (!Array.isArray(json.resetEvents)) {
      error('PACK_RESET_EVENTS_INVALID', 'resetEvents must be an array', 'resetEvents')
    } else {
      const seen = new Set()
      json.resetEvents.forEach((event, i) => {
        const at = `resetEvents[${i}]`
        if (!event?.id || !SLUG_PATTERN.test(String(event.id))) {
          error(
            'PACK_RESET_EVENT_ID_INVALID',
            `${at}.id must be lowercase letters, digits and hyphens`,
            `${at}.id`, { found: event?.id }
          )
          return
        }
        if (RESET_EVENTS.includes(event.id)) {
          error(
            'PACK_RESET_EVENT_ID_COLLISION',
            `${at}.id "${event.id}" is already a built-in reset event`,
            `${at}.id`, { found: event.id }
          )
          return
        }
        if (seen.has(event.id)) {
          error('PACK_RESET_EVENT_ID_COLLISION', `${at}.id "${event.id}" is declared twice`, `${at}.id`)
          return
        }
        seen.add(event.id)
        customResetEvents.push(event.id)
      })
    }
  }
  const allowedResetEvents = [...RESET_EVENTS, ...customResetEvents]
  const resetEventInvalid = (event, at) => error(
    'ROOM_RESET_EVENT_INVALID',
    `${at}.resetsOn has "${event}"; expected one of ${allowedResetEvents.join(', ')}`,
    `${at}.resetsOn`, { found: event, allowed: allowedResetEvents }
  )

  // ── Text template vars ────────────────────────────────────────────────────
  // Pack-authored {{key}} substitutions for room text, on top of the
  // always-available {{cellColor}}. Declared here so room text below can be
  // scanned for tokens that don't resolve to anything.

  const customTemplateKeys = []
  if (json.templateVars != null) {
    if (!Array.isArray(json.templateVars)) {
      error('PACK_TEMPLATE_VARS_INVALID', 'templateVars must be an array', 'templateVars')
    } else {
      const seen = new Set()
      json.templateVars.forEach((v, i) => {
        const at = `templateVars[${i}]`
        if (!v?.key || !TEMPLATE_VAR_PATTERN.test(String(v.key))) {
          error(
            'PACK_TEMPLATE_VAR_KEY_INVALID',
            `${at}.key must start with a letter or underscore, then letters, digits or underscores`,
            `${at}.key`, { found: v?.key }
          )
          return
        }
        if (BUILTIN_TEMPLATE_VARS.includes(v.key) || RESERVED_TEMPLATE_VARS.includes(v.key)) {
          error(
            'PACK_TEMPLATE_VAR_KEY_COLLISION',
            `${at}.key "${v.key}" is a reserved template variable and cannot be redeclared`,
            `${at}.key`, { found: v.key }
          )
          return
        }
        if (seen.has(v.key)) {
          error('PACK_TEMPLATE_VAR_KEY_COLLISION', `${at}.key "${v.key}" is declared twice`, `${at}.key`)
          return
        }
        seen.add(v.key)
        customTemplateKeys.push(v.key)
      })
    }
  }
  const knownTemplateVars = new Set([...BUILTIN_TEMPLATE_VARS, ...customTemplateKeys])

  // Advisory only: an unknown {{token}} is usually a typo, but a pack that
  // pastes literal braces for some other reason shouldn't be blocked.
  const checkTemplateTokens = (text, at) => {
    if (!text) return
    for (const match of text.matchAll(/\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g)) {
      const key = match[1]
      if (key === 'variant' || knownTemplateVars.has(key)) continue
      warn(
        'TEMPLATE_VAR_UNKNOWN',
        `${at} references {{${key}}}, which is not cellColor or a declared templateVars entry`,
        at, { found: key }
      )
    }
  }

  // ── Cell colors ───────────────────────────────────────────────────────────

  const colors = json.cells?.colors ?? []
  if (colors.length !== cells) {
    error(
      'CELL_COLORS_COUNT',
      `cells.colors must hold exactly ${cells} entries, found ${colors.length}`,
      'cells.colors', { found: colors.length, expected: cells }
    )
  }
  const hexes = colors.map(c => c?.hex).filter(Boolean)
  if (new Set(hexes).size !== hexes.length) {
    // Advisory, not blocking: a pack that doesn't lean on color-as-tesseract-tell
    // (a chase, a non-visual system) has no reason to need ten distinct hexes.
    warn(
      'CELL_COLORS_DUPLICATE',
      'cells.colors contains duplicate hex values; the color is normally the only ' +
      'in-fiction tell for which tesseract the party is in',
      'cells.colors'
    )
  }
  const names = colors.map(c => c?.name).filter(Boolean)
  if (names.length && new Set(names).size !== names.length) {
    warn('CELL_COLORS_NAME_DUPLICATE', 'two cell colors share a name', 'cells.colors')
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────

  const rooms = json.rooms ?? {}
  const fillerRooms = json.fillerRooms ?? {}

  for (const id of Object.keys(fillerRooms)) {
    if (rooms[id]) {
      error(
        'ROOM_SLUG_COLLISION',
        `"${id}" is defined in both rooms and fillerRooms`,
        `fillerRooms.${id}`
      )
    }
  }

  const checkRoom = (id, room, path, isFiller) => {
    if (!SLUG_PATTERN.test(id)) {
      error('ROOM_SLUG_INVALID', `"${id}" must be lowercase letters, digits and hyphens`, path)
    }
    if (!room || typeof room !== 'object') {
      error('ROOM_NOT_AN_OBJECT', `${path} must be an object`, path)
      return
    }
    if (!room.name) {
      warn('ROOM_NAME_MISSING', `${path} has no name; the GM sees this in the log`, `${path}.name`)
    }
    if (!room.read) {
      warn('ROOM_READ_EMPTY', `${path} has no read-aloud text`, `${path}.read`)
    }
    checkTemplateTokens(room.read, `${path}.read`)
    checkTemplateTokens(room.detail, `${path}.detail`)
    checkTemplateTokens(room.gm, `${path}.gm`)
    checkTemplateTokens(room.orientation, `${path}.orientation`)
    if (room.onKey && typeof room.onKey === 'object') {
      checkTemplateTokens(room.onKey.read, `${path}.onKey.read`)
      checkTemplateTokens(room.onKey.detail, `${path}.onKey.detail`)
      checkTemplateTokens(room.onKey.gm, `${path}.onKey.gm`)
    }

    // ── v2 content ──
    const listCheck = (list, field, extra) => {
      if (list == null) return
      if (!Array.isArray(list)) {
        error('ROOM_LIST_INVALID', `${path}.${field} must be an array`, `${path}.${field}`)
        return
      }
      list.forEach((entry, i) => {
        const at = `${path}.${field}[${i}]`
        if (!entry || typeof entry !== 'object') {
          error('ROOM_LIST_INVALID', `${at} must be an object`, at)
          return
        }
        if (!entry.name) {
          warn('ROOM_LIST_UNNAMED', `${at} has no name`, `${at}.name`)
        }
        for (const event of entry.resetsOn ?? []) {
          if (!allowedResetEvents.includes(event)) resetEventInvalid(event, at)
        }
        extra?.(entry, at)
      })
    }

    listCheck(room.creatures, 'creatures')
    listCheck(room.features, 'features')

    // A creature and a feature may share a name, but not an id within its own
    // list -- their actions are keyed by it, so a clash silently merges two
    // separate things into one toggle.
    for (const field of ['creatures', 'features']) {
      const ids = (room[field] ?? [])
        .map(e => e?.id ?? e?.name)
        .filter(Boolean)
      if (new Set(ids).size !== ids.length) {
        error(
          'ROOM_LIST_DUPLICATE_ID',
          `${path}.${field} has two entries with the same id; their actions would collide`,
          `${path}.${field}`
        )
      }
    }

    if (room.rest != null) {
      if (typeof room.rest !== 'object' || Array.isArray(room.rest)) {
        error('ROOM_REST_INVALID', `${path}.rest must be an object`, `${path}.rest`)
      } else if (room.rest.safety != null && !REST_SAFETY.includes(room.rest.safety)) {
        error(
          'ROOM_REST_SAFETY_INVALID',
          `${path}.rest.safety must be one of ${REST_SAFETY.join(', ')}`,
          `${path}.rest.safety`, { found: room.rest.safety, allowed: REST_SAFETY }
        )
      }
    }

    if (room.links != null) {
      if (!Array.isArray(room.links)) {
        error('ROOM_LINKS_INVALID', `${path}.links must be an array`, `${path}.links`)
      } else {
        room.links.forEach((link, i) => {
          if (!link?.url) {
            error('ROOM_LINK_NO_URL', `${path}.links[${i}] has no url`, `${path}.links[${i}]`)
          }
        })
      }
    }

    // Room-level actions: ids must be slugs so they cannot collide with the
    // namespaced creature/feature ones, and resetsOn has to be a known event.
    if (room.actions != null) {
      if (!Array.isArray(room.actions)) {
        error('ROOM_ACTIONS_INVALID', `${path}.actions must be an array`, `${path}.actions`)
      } else {
        room.actions.forEach((action, i) => {
          const at = `${path}.actions[${i}]`
          if (!action?.id || !SLUG_PATTERN.test(String(action.id))) {
            error(
              'ROOM_ACTION_ID_INVALID',
              `${at}.id must be lowercase letters, digits and hyphens`,
              `${at}.id`, { found: action?.id }
            )
          }
          for (const event of action?.resetsOn ?? []) {
            if (!allowedResetEvents.includes(event)) resetEventInvalid(event, at)
          }
        })
      }
    }

    // Key content nobody can reach: the room's tesseract only grants a key if
    // the room can hold one, or another room in that cell can.
    if (room.onKey && typeof room.onKey !== 'object') {
      error('ROOM_ONKEY_INVALID', `${path}.onKey must be an object`, `${path}.onKey`)
    }

    const gravity = room.gravity ?? {}
    if (gravity.type !== undefined && !GRAVITY_TYPES.includes(gravity.type)) {
      error(
        'ROOM_GRAVITY_TYPE_INVALID',
        `${path}.gravity.type "${gravity.type}" must be one of ${GRAVITY_TYPES.join(', ')}`,
        `${path}.gravity.type`, { found: gravity.type, allowed: GRAVITY_TYPES }
      )
    }
    if (gravity.type === 'Fixed') {
      const g = gravity.gravity
      if (!Number.isInteger(g) || g < 0 || g >= 6) {
        error(
          'ROOM_GRAVITY_VALUE_INVALID',
          `${path}.gravity.gravity must be an integer 0-5 for Fixed gravity, found ${g}`,
          `${path}.gravity.gravity`, { found: g }
        )
      }
    }

    if (room.role != null) {
      if (!ROOM_ROLES.includes(room.role)) {
        error(
          'ROOM_ROLE_INVALID',
          `${path}.role must be ${ROOM_ROLES.join(' or ')}, found "${room.role}"`,
          `${path}.role`
        )
      } else if (isFiller) {
        error(
          'FILLER_ROOM_HAS_ROLE',
          `${path} is filler and cannot be the ${room.role} room -- filler repeats, ` +
          'and a dungeon has one of each',
          `${path}.role`
        )
      }
    }

    if (room.maxInstances != null &&
        (!Number.isInteger(room.maxInstances) || room.maxInstances < 1)) {
      error(
        'ROOM_MAX_INSTANCES_INVALID',
        `${path}.maxInstances must be a positive integer, found ${room.maxInstances}`,
        `${path}.maxInstances`
      )
    }

    // Two instances of one content cannot avoid sharing a cell past 5 copies,
    // since each occupies 2 of the 10 cells.
    if (room.maxInstances > MAX_EXCLUDE_GROUP) {
      warn(
        'REPEAT_CELL_COLLISION',
        `${path} may appear ${room.maxInstances} times, so some copies must share a ` +
        'tesseract; give it variants so the GM can tell them apart',
        `${path}.maxInstances`, { maxInstances: room.maxInstances, limit: MAX_EXCLUDE_GROUP }
      )
    }

    if (room.variants != null) {
      if (!Array.isArray(room.variants)) {
        error('ROOM_VARIANTS_INVALID', `${path}.variants must be an array`, `${path}.variants`)
      } else {
        room.variants.forEach((v, i) => {
          if (!v || typeof v !== 'object' || !v.id) {
            error(
              'ROOM_VARIANTS_INVALID',
              `${path}.variants[${i}] needs an id`,
              `${path}.variants[${i}]`
            )
          }
        })
        const ids = room.variants.map(v => v?.id).filter(Boolean)
        if (new Set(ids).size !== ids.length) {
          error('ROOM_VARIANTS_INVALID', `${path}.variants has duplicate ids`, `${path}.variants`)
        }
      }
    }
  }

  for (const [id, room] of Object.entries(rooms)) checkRoom(id, room, `rooms.${id}`, false)
  for (const [id, room] of Object.entries(fillerRooms)) {
    checkRoom(id, room, `fillerRooms.${id}`, true)
  }

  // ── Roles ─────────────────────────────────────────────────────────────────

  for (const role of ROOM_ROLES) {
    const held = Object.entries(rooms).filter(([, r]) => r?.role === role).map(([id]) => id)

    if (held.length === 0) {
      error(
        'ROLE_MISSING',
        `no room declares role "${role}"; a dungeon needs exactly one`,
        'rooms', { role }
      )
    } else if (held.length > 1) {
      error(
        'ROLE_DUPLICATED',
        `${held.length} rooms declare role "${role}": ${held.join(', ')}`,
        'rooms', { role, rooms: held }
      )
    }
  }

  // ── Groups ────────────────────────────────────────────────────────────────
  // includeGroup: every member must share at least one tesseract, so a group
  // cannot exceed the 8 rooms a cell holds.
  // excludeGroup: no two members may share any tesseract, and a room occupies
  // 2 of 10 cells, so at most 5 can be pairwise disjoint.

  const groups = { includeGroup: {}, excludeGroup: {} }
  for (const [id, room] of Object.entries(rooms)) {
    for (const kind of ['includeGroup', 'excludeGroup']) {
      const tag = room?.[kind]
      if (tag != null) (groups[kind][tag] ??= []).push(id)
    }
  }

  for (const [tag, members] of Object.entries(groups.includeGroup)) {
    if (members.length > MAX_INCLUDE_GROUP) {
      error(
        'INCLUDE_GROUP_TOO_LARGE',
        `includeGroup "${tag}" has ${members.length} rooms but a tesseract holds ` +
        `${MAX_INCLUDE_GROUP}, so they cannot all share one`,
        'rooms', { tag, members, limit: MAX_INCLUDE_GROUP }
      )
    } else if (members.length === 1) {
      warn(
        'INCLUDE_GROUP_SINGLETON',
        `includeGroup "${tag}" has one member (${members[0]}), which constrains nothing`,
        `rooms.${members[0]}.includeGroup`, { tag }
      )
    }
  }

  for (const [tag, members] of Object.entries(groups.excludeGroup)) {
    if (members.length > MAX_EXCLUDE_GROUP) {
      error(
        'EXCLUDE_GROUP_TOO_LARGE',
        `excludeGroup "${tag}" has ${members.length} rooms; each occupies 2 of ` +
        `${cells} tesseracts, so at most ${MAX_EXCLUDE_GROUP} can stay pairwise apart`,
        'rooms', { tag, members, limit: MAX_EXCLUDE_GROUP }
      )
    } else if (members.length === 1) {
      warn(
        'EXCLUDE_GROUP_SINGLETON',
        `excludeGroup "${tag}" has one member (${members[0]}), which constrains nothing`,
        `rooms.${members[0]}.excludeGroup`, { tag }
      )
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  if (json.actions != null) {
    if (!Array.isArray(json.actions)) {
      error('PACK_ACTIONS_INVALID', 'actions must be an array', 'actions')
    } else {
      json.actions.forEach((action, i) => {
        if (!action?.id || !SLUG_PATTERN.test(String(action.id))) {
          error(
            'PACK_ACTION_ID_INVALID',
            `actions[${i}].id must be lowercase letters, digits and hyphens`,
            `actions[${i}].id`, { found: action?.id }
          )
        }
        for (const event of action?.resetsOn ?? []) {
          if (!allowedResetEvents.includes(event)) resetEventInvalid(event, `actions[${i}]`)
        }
      })
    }
  }

  // ── Filler ────────────────────────────────────────────────────────────────

  const filler = json.filler ?? {}
  if (filler.strategy != null && !FILLER_STRATEGIES.includes(filler.strategy)) {
    error(
      'FILLER_STRATEGY_INVALID',
      `filler.strategy must be one of ${FILLER_STRATEGIES.join(', ')}`,
      'filler.strategy', { found: filler.strategy }
    )
  }
  if (filler.distribution != null && !FILLER_DISTRIBUTIONS.includes(filler.distribution)) {
    error(
      'FILLER_DISTRIBUTION_INVALID',
      `filler.distribution must be one of ${FILLER_DISTRIBUTIONS.join(', ')}`,
      'filler.distribution', { found: filler.distribution }
    )
  }

  for (const id of filler.templates ?? []) {
    if (!fillerRooms[id]) {
      error(
        'FILLER_REF_UNKNOWN',
        `filler.templates references "${id}", which is not in fillerRooms`,
        'filler.templates', { id }
      )
    }
  }
  if (Array.isArray(filler.reusePool)) {
    for (const id of filler.reusePool) {
      if (!rooms[id]) {
        error(
          'FILLER_REF_UNKNOWN',
          `filler.reusePool references "${id}", which is not in rooms`,
          'filler.reusePool', { id }
        )
      }
    }
  }

  // Variants only earn their keep on content that can actually repeat.
  for (const [id, room] of Object.entries(fillerRooms)) {
    if (room?.variants?.length && room.maxInstances === 1) {
      warn(
        'VARIANTS_UNUSED',
        `fillerRooms.${id} declares variants but maxInstances is 1, so none will show`,
        `fillerRooms.${id}.variants`
      )
    }
  }

  // ── Feasibility ───────────────────────────────────────────────────────────
  // Everything above is static.  This actually runs the resolver, which is the
  // only way to be sure the pack reaches `count` rooms.

  const authored = Object.keys(rooms).length
  const info = {
    packId: manifest.id ?? null,
    schemaVersion,
    authoredRooms: authored,
    fillerRooms: Object.keys(fillerRooms).length,
    fillerNeeded: Math.max(0, count - authored),
    roomCount: count,
    cellCount: cells
  }

  if (authored > count) {
    error(
      'PACK_TOO_MANY_ROOMS',
      `pack has ${authored} rooms but a dungeon holds ${count}`,
      'rooms', { authored, count }
    )
  }

  if (errors.length === 0) {
    try {
      const instances = resolveInstances(loadPack(json), makeRng(0), count)

      const keyEligible = instances.filter(i => i.room.keyEligible)
      info.keyEligibleInstances = keyEligible.length
      info.cellsWithKeys = Math.min(keyEligible.length, cells)
      info.distinctContent = new Set(instances.map(i => i.contentId)).size
      info.repeatedContent = instances.length - info.distinctContent

      // Key supply is descriptive, not a constraint: short supply just leaves
      // some tesseracts without a key, and a pack may intend that.
      if (keyEligible.length === 0) {
        warn(
          'KEY_ROOMS_NONE',
          'no room is keyEligible, so no tesseract will hold a key -- correct for a ' +
          'chase or a hunt, but not for a key-gated exit',
          'rooms', { keyEligible: 0 }
        )
      } else if (keyEligible.length < cells) {
        warn(
          'KEY_ROOMS_BELOW_CELLS',
          `${keyEligible.length} key-eligible rooms for ${cells} tesseracts, so ` +
          `${cells - keyEligible.length} will hold no key`,
          'rooms', { keyEligible: keyEligible.length, cells }
        )
      } else if (keyEligible.length === cells) {
        warn(
          'KEY_ROOMS_EXACT',
          `exactly ${cells} key-eligible rooms for ${cells} tesseracts, so key ` +
          'placement is forced and identical on every playthrough',
          'rooms', { keyEligible: keyEligible.length, cells }
        )
      }
    } catch (err) {
      if (err instanceof PackError) {
        error(err.code, err.message, 'filler', err.detail)
      } else {
        error('PACK_RESOLVE_FAILED', err.message, '')
      }
    }
  }

  return done(info)
}

// One-line-per-finding rendering for CLI output and error surfaces.
export function formatFindings (result) {
  const lines = []
  for (const e of result.errors) lines.push(`error   ${e.code}  ${e.path || '-'}\n        ${e.message}`)
  for (const w of result.warnings) lines.push(`warn    ${w.code}  ${w.path || '-'}\n        ${w.message}`)
  return lines.join('\n')
}
