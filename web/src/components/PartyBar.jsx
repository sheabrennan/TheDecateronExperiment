import { useState, useRef, useEffect } from 'react'
import { ink } from '../ink.js'

// Who is where, and which group the GM is running.
//
// Always present, even with one party -- the chip is where the roster lives, and
// a roster is not room content. It was on the room panel until it became obvious
// that "Vex is at 22 hit points" has nothing to do with the room the party
// happens to be standing in, and moved with them every time they walked.
//
// Click a chip to run that group. Click the one you are already running to open
// its details: name, roster, keys, and split or merge from there.

function Keys ({ keysHeld, cells }) {
  if (!keysHeld?.length) return null

  return (
    <span className='party-keys' title={`${keysHeld.length} key(s) carried`}>
      ⚷
      {keysHeld.map(id => (
        <span
          key={id}
          className='party-key'
          style={{ background: cells?.[id]?.color ?? 'var(--muted)' }}
          title={cells?.[id]?.colorName ?? `cell ${id}`}
        />
      ))}
    </span>
  )
}

function PartyDetail ({ party, cells, onRename, onNotes, onSplit, onMerge, onClose, loading }) {
  const [name, setName] = useState(party.name)

  return (
    <div className='party-detail' onClick={e => e.stopPropagation()}>
      <div className='party-detail-head'>
        <input
          className='party-detail-name'
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { if (name !== party.name) onRename(party.id, name) }}
          placeholder='name this group…'
        />
        <button className='btn ghost' onClick={onClose}>close</button>
      </div>

      <div className='party-detail-where'>
        <span className='door-swatch' style={{ background: party.cell.color }} />
        {party.roomName} · {party.cell.colorName ?? party.cell.id}
      </div>

      {/* Free text on purpose: hit points, conditions, who is concentrating on
          what. The half of a session no schema should try to model. */}
      <label className='party-detail-field'>
        <span className='rp-label'>roster</span>
        <textarea
          className='rp-party-notes'
          defaultValue={party.notes ?? ''}
          placeholder='players, hit points, conditions, reminders…'
          rows={5}
          onBlur={e => {
            if (e.target.value !== (party.notes ?? '')) onNotes(party.id, e.target.value)
          }}
        />
      </label>

      {party.keysHeld?.length > 0 && (
        <div className='party-detail-field'>
          <span className='rp-label'>keys carried</span>
          <div className='party-detail-keys'>
            {party.keysHeld.map(id => (
              <span key={id} className='party-detail-key'>
                <span className='door-swatch' style={{ background: cells?.[id]?.color }} />
                {cells?.[id]?.colorName ?? id}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className='party-detail-actions'>
        <button className='btn' onClick={() => onSplit(party.id)} disabled={loading}>
          ⑃ split this group
        </button>
        {/* Only where they are actually standing together: the same room through
            a different tesseract is not the same place. */}
        {party.canMergeInto.map(other => (
          <button
            key={other.id}
            className='btn'
            onClick={() => onMerge(party.id, other.id)}
            disabled={loading}
          >⑂ merge into {other.name}</button>
        ))}
      </div>
    </div>
  )
}

export default function PartyBar ({
  parties = [], cells, onSelect, onSplit, onMerge, onRename, onNotes, loading
}) {
  const [openId, setOpenId] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!openId) return
    const onDown = e => { if (!ref.current?.contains(e.target)) setOpenId(null) }
    const onKey = e => { if (e.key === 'Escape') setOpenId(null) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [openId])

  if (!parties.length) return null

  const open = parties.find(p => p.id === openId)

  const pick = party => {
    // Click to run a group; click the one already running to open its details.
    if (party.isActive) setOpenId(id => (id === party.id ? null : party.id))
    else { onSelect(party.id); setOpenId(null) }
  }

  return (
    <div className='party-bar' ref={ref}>
      {parties.map(party => (
        <div
          key={party.id}
          className={`party-chip ${party.isActive ? 'is-active' : ''} ${openId === party.id ? 'is-open' : ''}`}
          style={{ '--party-color': ink(party.cell.color ?? '#888888') }}
        >
          <button
            className='party-pick'
            onClick={() => pick(party)}
            title={party.isActive
              ? `${party.roomName} · click for roster and options`
              : `switch to ${party.name}`}
          >
            <span className='party-swatch' style={{ background: party.cell.color }} />
            <span className='party-name'>{party.name}</span>
            {party.notes?.trim() && <span className='party-has-notes' title='roster noted'>▪</span>}
            <Keys keysHeld={party.keysHeld} cells={cells} />
          </button>
        </div>
      ))}

      {open && (
        <PartyDetail
          // Remount per party: the textarea is uncontrolled, so without this it
          // keeps the previous group's roster when the panel reopens on another.
          key={open.id}
          party={open}
          cells={cells}
          onRename={onRename}
          onNotes={onNotes}
          onSplit={id => { onSplit(id); setOpenId(null) }}
          onMerge={(from, into) => { onMerge(from, into); setOpenId(null) }}
          onClose={() => setOpenId(null)}
          loading={loading}
        />
      )}
    </div>
  )
}
