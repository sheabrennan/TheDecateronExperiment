import { useRef, useLayoutEffect } from 'react'
import { RESET_EVENTS, looseSlugify } from '../../../../src/pack/schema.js'

export function FieldError ({ errors }) {
  if (!errors || errors.length === 0) return null
  return <div className='builder-field-error'>{errors.map(e => e.message).join('; ')}</div>
}

// A textarea that always shows its full contents, sized from scrollHeight on
// every render (mount included) rather than a fixed row count -- switching
// rooms shouldn't mean re-expanding every box to see what's already written.
export function AutoTextarea ({ value, ...rest }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  })
  return <textarea ref={ref} value={value} {...rest} />
}

// `customEvents` are pack-authored resetsOn triggers beyond the built-in
// RESET_EVENTS vocabulary (short-rest/long-rest/key/doors/shuffle) — e.g. a
// puzzle pack's own "return-to-start" trigger. They're plain {id, label}
// pairs defined once on the pack (see ManifestPanel) and offered everywhere
// a resetsOn list is edited.
export function ResetEventPicker ({ value, onChange, customEvents = [] }) {
  const list = value ?? []
  const toggle = event => onChange(list.includes(event) ? list.filter(e => e !== event) : [...list, event])
  const events = [...RESET_EVENTS, ...customEvents.map(e => e.id).filter(Boolean)]
  return (
    <div className='builder-chip-row'>
      {events.map(event => (
        <button
          type='button' key={event}
          className={`chip toggle ${list.includes(event) ? 'active' : ''}`}
          onClick={() => toggle(event)}
          data-tip={`resets when "${event}" fires`}
        >{event}</button>
      ))}
    </div>
  )
}

// Where a custom reset event's id shows up across the whole pack: pack-level
// actions, and every room's (and filler room's) creatures/features/action
// override. Deleting the event out from under any of these leaves a
// resetsOn reference the validator can never resolve again -- a permanent
// error a room-by-room search is the only way to find. This is the search.
function resetEventUsers (draft, eventId) {
  const users = []
  const scan = (list, label) => {
    for (const item of list ?? []) {
      if (item?.resetsOn?.includes(eventId)) users.push(label)
    }
  }
  scan(draft.actions, 'pack-level actions')
  for (const [id, room] of Object.entries(draft.rooms ?? {})) {
    scan(room.creatures, `${room.name || id} (creatures)`)
    scan(room.features, `${room.name || id} (features)`)
    scan(room.actions, `${room.name || id} (room actions)`)
  }
  for (const [id, room] of Object.entries(draft.fillerRooms ?? {})) {
    scan(room.creatures, `${room.name || id} (creatures)`)
    scan(room.features, `${room.name || id} (features)`)
    scan(room.actions, `${room.name || id} (room actions)`)
  }
  return users
}

// Removes the event itself and strips it out of every resetsOn list that
// named it, everywhere in the pack -- the cascade `resetEventUsers` finds.
function removeResetEventEverywhere (draft, eventId) {
  const strip = list => list == null
    ? list
    : list.map(item => item?.resetsOn?.includes(eventId)
      ? { ...item, resetsOn: item.resetsOn.filter(e => e !== eventId) }
      : item)
  const stripRoom = room => ({ ...room, creatures: strip(room.creatures), features: strip(room.features), actions: strip(room.actions) })
  return {
    ...draft,
    resetEvents: (draft.resetEvents ?? []).filter(e => e.id !== eventId),
    actions: strip(draft.actions),
    rooms: Object.fromEntries(Object.entries(draft.rooms ?? {}).map(([id, r]) => [id, stripRoom(r)])),
    fillerRooms: Object.fromEntries(Object.entries(draft.fillerRooms ?? {}).map(([id, r]) => [id, stripRoom(r)]))
  }
}

// Confirms before deleting a custom reset event that's actually in use
// (listing where), then deletes it and cleans up every reference in one
// patch -- rather than leaving resetsOn entries pointing at nothing, which
// the validator can flag but never repair on its own.
export function confirmRemoveResetEvent (draft, onPatch, event) {
  const users = resetEventUsers(draft, event.id)
  if (users.length > 0) {
    const label = event.label || event.id
    const list = [...new Set(users)].join(', ')
    const ok = window.confirm(
      `"${label}" is used by: ${list}.\n\nDelete it and remove it from all of them?`
    )
    if (!ok) return
  }
  onPatch(d => removeResetEventEverywhere(d, event.id))
}

// The row editor shared by pack-level actions (ManifestPanel) and a room's
// own action override (RoomDetail) — same shape, `{id, label, resetsOn}`,
// just a different array living at a different path. `newAction` lets a
// caller pick what "+ add action" starts from -- the pack's list defaults to
// the built-in `searched`, but a room *overriding* the pack's actions is
// starting something new, not repeating the pack default back at itself.
export function ActionsEditor ({ actions, onChange, customEvents = [], newAction = { id: 'searched', label: 'searched', resetsOn: [] } }) {
  return (
    <>
      <ul className='builder-action-rows'>
        {actions.map((a, i) => (
          <li key={i} className='builder-action-row'>
            <div className='builder-action-row-top'>
              <input
                value={a.id ?? ''}
                onChange={e => onChange(actions.map((x, j) => j === i ? { ...x, id: looseSlugify(e.target.value) } : x))}
                placeholder='id'
                className='builder-action-id'
                data-tip='the action id, e.g. "searched" — shows up wherever the action is referenced'
              />
              <input
                value={a.label ?? ''}
                onChange={e => onChange(actions.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                placeholder='label'
                className='builder-action-label'
                data-tip='what the GM sees on the action button'
              />
              <button type='button' className='btn ghost' onClick={() => onChange(actions.filter((_, j) => j !== i))}>×</button>
            </div>
            <ResetEventPicker
              value={a.resetsOn}
              customEvents={customEvents}
              onChange={v => onChange(actions.map((x, j) => j === i ? { ...x, resetsOn: v } : x))}
            />
          </li>
        ))}
      </ul>
      <button
        type='button' className='btn ghost'
        onClick={() => onChange([...actions, { ...newAction }])}
      >+ add action</button>
    </>
  )
}
