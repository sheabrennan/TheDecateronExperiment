import { useState } from 'react'
import { slugify, uniqueSlug, ROOM_DEFAULTS, FILLER_ROOM_DEFAULTS } from '../../../../src/pack/schema.js'

function errorCount (validation, prefix) {
  if (!validation) return 0
  return validation.errors.filter(e => e.path.startsWith(prefix)).length
}

const ROLE_ICON = { start: '▶', exit: '⊕' }
const ROLE_TITLE = { start: 'start room', exit: 'exit room' }

function RoomGroup ({ title, rooms, kind, selection, onSelect, onAdd, onRemove, validation, pathKey }) {
  const [name, setName] = useState('')

  const handleAdd = e => {
    e.preventDefault()
    if (!name.trim()) return
    onAdd(name.trim())
    setName('')
  }

  return (
    <div className='builder-room-group'>
      <div className='builder-group-heading'>{title}</div>
      <ul className='builder-room-rows'>
        {Object.entries(rooms).map(([id, room]) => {
          const n = errorCount(validation, `${pathKey}.${id}.`)
          const active = selection.kind === kind && selection.id === id
          return (
            <li key={id}>
              <button
                className={`builder-room-row ${active ? 'active' : ''}`}
                onClick={() => onSelect({ kind, id })}
              >
                <span className='builder-room-label'>
                  {room.role && (
                    <span className='builder-role-icon' data-tip={ROLE_TITLE[room.role]}>
                      {ROLE_ICON[room.role]}
                    </span>
                  )}
                  {room.name || id}
                </span>
                {n > 0 && <span className='chip danger small'>{n}</span>}
              </button>
              <button className='btn ghost' data-tip='remove' onClick={() => onRemove(id)}>×</button>
            </li>
          )
        })}
      </ul>
      <form onSubmit={handleAdd} className='builder-add-form'>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={`+ add ${kind === 'room' ? 'room' : 'template'}…`}
        />
        <button type='submit' className='btn ghost' disabled={!name.trim()}>add</button>
      </form>
    </div>
  )
}

export default function RoomList ({ draft, selection, onSelect, onPatch, validation }) {
  const startCount = Object.values(draft.rooms).filter(r => r.role === 'start').length
  const exitCount = Object.values(draft.rooms).filter(r => r.role === 'exit').length

  const takenSlugs = () => new Set([...Object.keys(draft.rooms), ...Object.keys(draft.fillerRooms)])

  const addRoom = name => {
    const id = uniqueSlug(slugify(name), takenSlugs())
    onPatch(d => ({ ...d, rooms: { ...d.rooms, [id]: { ...ROOM_DEFAULTS, name } } }))
    onSelect({ kind: 'room', id })
  }

  const addFillerRoom = name => {
    const id = uniqueSlug(slugify(name), takenSlugs())
    onPatch(d => ({ ...d, fillerRooms: { ...d.fillerRooms, [id]: { ...FILLER_ROOM_DEFAULTS, name } } }))
    onSelect({ kind: 'fillerRoom', id })
  }

  const removeRoom = id => {
    onPatch(d => {
      const rooms = { ...d.rooms }
      delete rooms[id]
      return { ...d, rooms }
    })
    if (selection.kind === 'room' && selection.id === id) onSelect({ kind: 'manifest' })
  }

  const removeFillerRoom = id => {
    onPatch(d => {
      const fillerRooms = { ...d.fillerRooms }
      delete fillerRooms[id]
      return { ...d, fillerRooms }
    })
    if (selection.kind === 'fillerRoom' && selection.id === id) onSelect({ kind: 'manifest' })
  }

  return (
    <nav className='builder-room-list'>
      <button
        className={`builder-nav-row ${selection.kind === 'manifest' ? 'active' : ''}`}
        onClick={() => onSelect({ kind: 'manifest' })}
      >
        Manifest
      </button>
      <button
        className={`builder-nav-row ${selection.kind === 'filler' ? 'active' : ''}`}
        onClick={() => onSelect({ kind: 'filler' })}
      >
        Filler config
      </button>
      <button
        className={`builder-nav-row ${selection.kind === 'templates' ? 'active' : ''}`}
        onClick={() => onSelect({ kind: 'templates' })}
        data-tip='{{cellColor}} and any custom text substitutions this pack declares'
      >
        Text templates
      </button>

      <RoomGroup
        title={`Rooms · ${startCount}/1 start · ${exitCount}/1 exit`}
        rooms={draft.rooms}
        kind='room'
        pathKey='rooms'
        selection={selection}
        onSelect={onSelect}
        onAdd={addRoom}
        onRemove={removeRoom}
        validation={validation}
      />

      <RoomGroup
        title='Filler templates'
        rooms={draft.fillerRooms}
        kind='fillerRoom'
        pathKey='fillerRooms'
        selection={selection}
        onSelect={onSelect}
        onAdd={addFillerRoom}
        onRemove={removeFillerRoom}
        validation={validation}
      />
    </nav>
  )
}
