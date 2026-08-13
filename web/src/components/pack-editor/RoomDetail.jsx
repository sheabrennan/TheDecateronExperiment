import { useState } from 'react'
import {
  GRAVITY_TYPES, ROOM_ROLES, REST_SAFETY, FEATURE_KINDS,
  MAX_INCLUDE_GROUP, MAX_EXCLUDE_GROUP, slugify, uniqueSlug
} from '../../../../src/pack/schema.js'
import { FieldError as SharedFieldError, ResetEventPicker, ActionsEditor, AutoTextarea } from './shared.jsx'

function fieldErrors (validation, pathPrefix, ...suffixes) {
  if (!validation) return []
  return validation.errors.filter(e =>
    suffixes.some(s => e.path === `${pathPrefix}.${s}` || e.path.startsWith(`${pathPrefix}.${s}.`) || e.path.startsWith(`${pathPrefix}.${s}[`))
  )
}

const FieldError = SharedFieldError

function CreatureRow ({ creature, onChange, onRemove, onMove, customEvents }) {
  return (
    <li className='builder-list-row'>
      <input
        value={creature.name ?? ''}
        onChange={e => onChange({ ...creature, name: e.target.value })}
        placeholder='name'
        data-tip='the creature name shown to the GM; also the action label ("<name> defeated")'
      />
      <input
        value={creature.count ?? ''}
        onChange={e => onChange({ ...creature, count: e.target.value })}
        placeholder='count'
        className='builder-narrow'
        data-tip='free text, e.g. "3" or "1d4" — never parsed by the engine'
      />
      <input
        value={creature.notes ?? ''}
        onChange={e => onChange({ ...creature, notes: e.target.value })}
        placeholder='notes'
        data-tip='GM-only notes about this creature'
      />
      <ResetEventPicker value={creature.resetsOn} customEvents={customEvents} onChange={v => onChange({ ...creature, resetsOn: v })} />
      <div className='builder-row-actions'>
        <button type='button' className='btn ghost' onClick={() => onMove(-1)} data-tip='move up'>↑</button>
        <button type='button' className='btn ghost' onClick={() => onMove(1)} data-tip='move down'>↓</button>
        <button type='button' className='btn ghost' onClick={onRemove} data-tip='remove'>×</button>
      </div>
    </li>
  )
}

function FeatureRow ({ feature, onChange, onRemove, onMove, customEvents }) {
  return (
    <li className='builder-list-row'>
      <input
        value={feature.name ?? ''}
        onChange={e => onChange({ ...feature, name: e.target.value })}
        placeholder='name'
        data-tip='the feature name shown to the GM; also the action label ("<name> <verb>")'
      />
      <select
        value={feature.kind ?? 'other'}
        onChange={e => onChange({ ...feature, kind: e.target.value })}
        data-tip='descriptive only — picks the action verb (hazard→disarmed, treasure→taken, etc); the engine never branches on it'
      >
        {FEATURE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
      </select>
      <input
        value={feature.detail ?? ''}
        onChange={e => onChange({ ...feature, detail: e.target.value })}
        placeholder='detail'
        data-tip='GM-only detail about this feature'
      />
      <ResetEventPicker value={feature.resetsOn} customEvents={customEvents} onChange={v => onChange({ ...feature, resetsOn: v })} />
      <div className='builder-row-actions'>
        <button type='button' className='btn ghost' onClick={() => onMove(-1)} data-tip='move up'>↑</button>
        <button type='button' className='btn ghost' onClick={() => onMove(1)} data-tip='move down'>↓</button>
        <button type='button' className='btn ghost' onClick={onRemove} data-tip='remove'>×</button>
      </div>
    </li>
  )
}

function move (list, index, dir) {
  const next = [...list]
  const target = index + dir
  if (target < 0 || target >= next.length) return list
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export default function RoomDetail ({ draft, onPatch, onSelect, validation, selection, isFiller }) {
  const collectionKey = isFiller ? 'fillerRooms' : 'rooms'
  const id = selection.id
  const room = draft[collectionKey][id]
  const pathPrefix = `${collectionKey}.${id}`
  const [slugDraft, setSlugDraft] = useState(id)

  if (!room) return <div className='hint'>select a room</div>

  const set = fields => onPatch(d => ({
    ...d,
    [collectionKey]: { ...d[collectionKey], [id]: { ...d[collectionKey][id], ...fields } }
  }))

  const setGravity = fields => set({ gravity: { ...room.gravity, ...fields } })

  const setRest = fields => set({ rest: room.rest ? { ...room.rest, ...fields } : { safety: 'safe', effect: '', ...fields } })

  const membershipCount = (field, value) => {
    if (!value) return null
    return Object.values(draft.rooms).filter(r => r[field] === value).length
  }

  const handleRename = () => {
    const taken = new Set([...Object.keys(draft.rooms), ...Object.keys(draft.fillerRooms)].filter(s => s !== id))
    const newId = uniqueSlug(slugify(slugDraft, id), taken)
    if (newId === id) return
    onPatch(d => {
      const collection = { ...d[collectionKey] }
      const entry = collection[id]
      delete collection[id]
      collection[newId] = entry
      // Filler references to the old slug would otherwise dangle.
      const filler = { ...d.filler }
      if (Array.isArray(filler.templates)) filler.templates = filler.templates.map(t => t === id ? newId : t)
      if (Array.isArray(filler.reusePool)) filler.reusePool = filler.reusePool.map(t => t === id ? newId : t)
      return { ...d, [collectionKey]: collection, filler }
    })
    onSelect({ kind: isFiller ? 'fillerRoom' : 'room', id: newId })
    setSlugDraft(newId)
  }

  const customEvents = draft.resetEvents ?? []

  return (
    <div className='builder-room-detail'>
      <div className='builder-field-row' data-tip="This room's id — the key it lives under in rooms/fillerRooms, and what includeGroup/excludeGroup/filler references point at. Renaming moves it and patches any filler references automatically.">
        <label>Slug</label>
        <div className='builder-slug-edit'>
          <input value={slugDraft} onChange={e => setSlugDraft(e.target.value)} />
          <button type='button' className='btn ghost' onClick={handleRename} disabled={slugDraft === id}>rename</button>
        </div>
      </div>

      <div className='builder-field-row' data-tip='The name shown to the GM everywhere this room appears — the room list, the play screen, the catalog.'>
        <label>Name</label>
        <input value={room.name ?? ''} onChange={e => set({ name: e.target.value })} />
        <FieldError errors={fieldErrors(validation, pathPrefix, 'name')} />
      </div>

      <div className='builder-field-row' data-tip='Safe to read to the players verbatim on arrival.'>
        <label>Read-aloud</label>
        <AutoTextarea value={room.read ?? ''} onChange={e => set({ read: e.target.value })} />
        <FieldError errors={fieldErrors(validation, pathPrefix, 'read')} />
      </div>

      <div className='builder-field-row' data-tip='What a closer look reveals — narrated only if the players ask or search.'>
        <label>Detail (on a closer look)</label>
        <AutoTextarea value={room.detail ?? ''} onChange={e => set({ detail: e.target.value })} />
      </div>

      <div className='builder-field-row' data-tip={"What is actually going on in this room. Never read aloud — this is the GM's private truth."}>
        <label>GM only (never read aloud)</label>
        <AutoTextarea value={room.gm ?? ''} onChange={e => set({ gm: e.target.value })} />
      </div>

      <div className='builder-field-row' data-tip={"This room's spatial gimmick — what makes its geometry distinct (e.g. \"the floor is also a wall\"). This app's whole subject."}>
        <label>Orientation (the spatial gimmick)</label>
        <AutoTextarea value={room.orientation ?? ''} onChange={e => set({ orientation: e.target.value })} />
      </div>

      <div className='builder-field-row' data-tip="How this room resolves its 'down' direction on entry. Fixed = always the same numbered door; Match = follows the door the party entered through; Random/Special = resolved by the engine or GM at entry time.">
        <label>Gravity</label>
        <select value={room.gravity?.type ?? 'Match'} onChange={e => setGravity({ type: e.target.value })}>
          {GRAVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {room.gravity?.type === 'Fixed' && (
          <input
            type='number' min={0} max={5}
            value={room.gravity?.gravity ?? 0}
            onChange={e => setGravity({ gravity: Number(e.target.value) })}
            className='builder-narrow'
            data-tip='which numbered door (0-5) gravity points to, for a Fixed-gravity room'
          />
        )}
        <FieldError errors={fieldErrors(validation, pathPrefix, 'gravity')} />
      </div>

      {!isFiller && (
        <div className='builder-field-row' data-tip='A dungeon needs exactly one start room and one exit room. Filler templates cannot hold a role.'>
          <label>Role</label>
          <select value={room.role ?? ''} onChange={e => set({ role: e.target.value || null })}>
            <option value=''>none</option>
            {ROOM_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <FieldError errors={fieldErrors(validation, pathPrefix, 'role')} />
        </div>
      )}

      <div className='builder-field-row' data-tip="Whether a party can take a short or long rest in this room, and what happens as a result — the effect text is GM-facing, e.g. 'creatures respawn after 1d4 hours'.">
        <label>Rest</label>
        <label className='builder-inline-check'>
          <input
            type='checkbox'
            checked={Boolean(room.rest)}
            onChange={e => set({ rest: e.target.checked ? { safety: 'safe', effect: '' } : null })}
          />
          allows resting here
        </label>
        {room.rest && (
          <select
            value={room.rest.safety ?? 'safe'}
            onChange={e => setRest({ safety: e.target.value })}
            data-tip="How safe an interruption-free rest is here: 'unsafe' or 'special' are the GM's cue to still roll for it."
          >
            {REST_SAFETY.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>
      {room.rest && (
        <div className='builder-field-row'>
          <label>Rest effect</label>
          <AutoTextarea
            value={room.rest.effect ?? ''}
            onChange={e => setRest({ effect: e.target.value })}
            placeholder='effect (e.g. "creatures respawn after 1d4 hours")'
          />
        </div>
      )}
      <FieldError errors={fieldErrors(validation, pathPrefix, 'rest')} />

      <div className='builder-field-row' data-tip='A free-text tag: every room sharing this tag is guaranteed to land in the same tesseract (cell). Capped at 8 members — a cell holds 8 rooms.'>
        <label>Include group (co-locate)</label>
        <input
          value={room.includeGroup ?? ''}
          onChange={e => set({ includeGroup: e.target.value || null })}
        />
        {room.includeGroup && (
          <span className='hint'>{membershipCount('includeGroup', room.includeGroup)} of max {MAX_INCLUDE_GROUP}</span>
        )}
      </div>

      <div className='builder-field-row' data-tip='A free-text tag: every room sharing this tag is guaranteed to never share a cell. Capped at 5 members — a room occupies 2 of 10 cells, so at most 5 can be pairwise disjoint.'>
        <label>Exclude group (never share a cell)</label>
        <input
          value={room.excludeGroup ?? ''}
          onChange={e => set({ excludeGroup: e.target.value || null })}
        />
        {room.excludeGroup && (
          <span className='hint'>{membershipCount('excludeGroup', room.excludeGroup)} of max {MAX_EXCLUDE_GROUP}</span>
        )}
      </div>

      <div className='builder-field-row' data-tip={"How many times this room's content may repeat across the 40 instances. Leave unset for a singleton — unless this room is also listed in the filler reuse pool, in which case unset means unlimited."}>
        <label>Max instances</label>
        <input
          type='number' min={1}
          value={room.maxInstances ?? ''}
          onChange={e => set({ maxInstances: e.target.value ? Number(e.target.value) : null })}
          placeholder='unset = singleton unless listed in filler'
          className='builder-narrow'
        />
        <FieldError errors={fieldErrors(validation, pathPrefix, 'maxInstances')} />
      </div>

      <div className='builder-field-row column'>
        <label data-tip="This room's own action list, in place of the pack's defaults — an empty list suppresses pack-level actions here entirely (e.g. a room with nothing to search).">
          Room actions
        </label>
        <label className='builder-inline-check'>
          <input
            type='checkbox'
            checked={room.actions != null}
            onChange={e => set({ actions: e.target.checked ? [] : null })}
          />
          override the pack's default actions for this room
        </label>
        {room.actions != null && (
          <ActionsEditor
            actions={room.actions}
            onChange={next => set({ actions: next })}
            customEvents={customEvents}
            newAction={{ id: '', label: '', resetsOn: [] }}
          />
        )}
        {room.actions != null && room.actions.length === 0 && (
          <div className='hint'>no actions — this room offers nothing from the pack defaults</div>
        )}
        <FieldError errors={fieldErrors(validation, pathPrefix, 'actions')} />
      </div>

      <div className='builder-field-row column'>
        <label data-tip="What the party can fight here. Each becomes a 'defeated' action automatically — you don't author actions separately.">
          Creatures
        </label>
        <ul className='builder-sub-list'>
          {(room.creatures ?? []).map((c, i) => (
            <CreatureRow
              key={i}
              creature={c}
              customEvents={customEvents}
              onChange={next => set({ creatures: room.creatures.map((x, j) => j === i ? next : x) })}
              onRemove={() => set({ creatures: room.creatures.filter((_, j) => j !== i) })}
              onMove={dir => set({ creatures: move(room.creatures, i, dir) })}
            />
          ))}
        </ul>
        <button
          type='button' className='btn ghost'
          onClick={() => set({ creatures: [...(room.creatures ?? []), { name: '', resetsOn: [] }] })}
        >+ add creature</button>
        <FieldError errors={fieldErrors(validation, pathPrefix, 'creatures')} />
      </div>

      <div className='builder-field-row column'>
        <label data-tip="Interactable things in the room — treasure, hazards, keys, levers, lore. Each becomes an action automatically (e.g. 'disarmed', 'taken'), same as creatures.">
          Features
        </label>
        <ul className='builder-sub-list'>
          {(room.features ?? []).map((f, i) => (
            <FeatureRow
              key={i}
              feature={f}
              customEvents={customEvents}
              onChange={next => set({ features: room.features.map((x, j) => j === i ? next : x) })}
              onRemove={() => set({ features: room.features.filter((_, j) => j !== i) })}
              onMove={dir => set({ features: move(room.features, i, dir) })}
            />
          ))}
        </ul>
        <button
          type='button' className='btn ghost'
          onClick={() => set({ features: [...(room.features ?? []), { name: '', kind: 'other', detail: '', resetsOn: [] }] })}
        >+ add feature</button>
        <FieldError errors={fieldErrors(validation, pathPrefix, 'features')} />
      </div>
    </div>
  )
}
