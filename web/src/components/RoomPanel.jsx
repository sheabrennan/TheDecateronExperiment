import { useState } from 'react'
import CubeDiagram from './CubeDiagram.jsx'
import DoorPlane from './DoorPlane.jsx'

// One room, as the GM needs it while running: the cube for orientation, the
// prose to read out, and the state toggles for what the party has already done.
//
// Used for both the room the party is standing in and the one behind an open
// door -- the GM should be able to read a room's description aloud without
// committing to walking into it.

function Field ({ label, children }) {
  if (!children) return null
  return (
    <div className='rp-field'>
      <span className='rp-label'>{label}</span>
      <div className='rp-value'>{children}</div>
    </div>
  )
}

// Which colour an action reads in: enemies are the dangerous ones, keys are the
// tesseract's own colour, everything else is neutral.
const TONE = { creature: 'danger', key: 'key', feature: null, room: null }

function Toggle ({ on, onChange, children, tone, resetsOn }) {
  // Read-only on the previewed room: the GM has not walked in yet.
  const title = resetsOn?.length
    ? `comes back on: ${resetsOn.join(', ')}`
    : 'stays done'

  return (
    <button
      className={`rp-toggle ${on ? 'is-on' : ''} ${tone ? `tone-${tone}` : ''} ${onChange ? '' : 'is-readonly'}`}
      onClick={onChange ? () => onChange(!on) : undefined}
      disabled={!onChange}
      aria-pressed={on}
      title={title}
    >
      <span className='rp-tick'>{on ? '✓' : '○'}</span>
      {children}
      {resetsOn?.length > 0 && <span className='rp-resets' title={title}>↻</span>}
    </button>
  )
}

// "Cleared in Verdant" — the party may have dealt with this room from the
// other tesseract only, and whether that still counts is the GM's ruling.
function OtherSide ({ progress }) {
  const other = progress?.otherSide
  const flags = ['cleared', 'looted'].filter(f => other?.[f])
  if (!flags.length) return null

  return (
    <div className='rp-otherside' style={{ '--other-color': other.cellColor }}>
      <span className='rp-otherside-arrow'>⤷</span>
      {flags.join(' & ')} in {other.cellName ?? `cell ${other.cellId}`}
    </div>
  )
}

export default function RoomPanel ({
  context, variant = 'current', color, rawColor,
  onFlag, onAddNote, loading
}) {
  const [noteDraft, setNoteDraft] = useState('')
  if (!context?.room) return null

  const { room, orientation, progress, isExit } = context
  const isPreview = variant === 'preview'
  const editable = Boolean(onFlag)

  const gravity = orientation?.gravityLabel ?? orientation?.gravityDesc ?? '—'

  const submitNote = e => {
    e.preventDefault()
    if (!noteDraft.trim()) return
    onAddNote(noteDraft)
    setNoteDraft('')
  }

  return (
    <section className={`room-panel is-${variant}`} style={{ '--panel-color': color }}>
      <header className='rp-head'>
        <span className='rp-name' style={{ color }}>{room.name}</span>
        {context.cell && (
          <span className='rp-cell' style={{ color }}>
            {/* True pack colour in the swatch, derived colour in the text. */}
            <span className='door-swatch' style={{ background: rawColor ?? color }} />
            {context.cell.colorName ?? `cell ${context.cell.id}`}
          </span>
        )}
        {progress?.holdsKey && <span className='rp-chip key'>⚷ key here</span>}
        {isExit && <span className='rp-chip exit'>⊕ exit</span>}
        {context.isBehind && <span className='rp-chip muted'>behind you</span>}
        {room.keyContentShown && (
          <span className='rp-chip key' title='this room reads differently now the key is held'>
            ⚷ changed
          </span>
        )}
      </header>

      <div className='rp-cube'>
        {/* Six live exits are a choice worth turning over; one doorway is not.
            The room being previewed shows only the plane in question. */}
        {isPreview
          ? (
            <DoorPlane
              doors={orientation?.doors ?? []}
              orientation={orientation}
              color={color}
              isBehind={Boolean(context.isBehind)}
            />
            )
          : (
            <CubeDiagram
              doors={orientation?.doors ?? []}
              cellColor={color}
              faceSize={116}
            />
            )}
      </div>

      <div className='rp-orient'>
        {/* Looking back at the room behind, the useful fact is which door they
            went out by, not which one they came in by a move ago. */}
        {orientation?.exitLabel
          ? <span><span className='rp-label'>left by</span> {orientation.exitLabel}</span>
          : <span><span className='rp-label'>entry</span> {orientation?.entryLabel ?? '—'}</span>}
        <span><span className='rp-label'>gravity</span> {gravity}</span>
      </div>

      {context.narrativeSummary && (
        <p className='rp-summary'>{context.narrativeSummary}</p>
      )}

      <div className='rp-body'>
        {/* The GM's reading order: what to say, what to say if asked, what to
            know. `read` is the only part safe to speak verbatim, so it is
            marked as such rather than left to be guessed at. */}
        {room.read && (
          <div className='rp-field'>
            <span className='rp-label'>read aloud</span>
            <blockquote className='rp-read'>{room.read}</blockquote>
          </div>
        )}
        <Field label='on a closer look'>{room.detail}</Field>
        <Field label='orientation'>{room.orientation}</Field>
        <Field label='gm notes'>{room.gm}</Field>

        {room.creatures?.length > 0 && (
          <div className='rp-field'>
            <span className='rp-label'>creatures</span>
            <ul className='rp-list'>
              {room.creatures.map((c, i) => (
                <li key={c.id ?? i}>
                  <span className='rp-danger'>⚔ {c.count ? `${c.count} ` : ''}{c.name}</span>
                  {c.notes && <span className='rp-list-note'>{c.notes}</span>}
                  {c.link && <span className='rp-list-ref'>{c.link}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {room.features?.length > 0 && (
          <div className='rp-field'>
            <span className='rp-label'>features</span>
            <ul className='rp-list'>
              {room.features.map((f, i) => (
                <li key={f.id ?? i}>
                  <span className={`rp-kind is-${f.kind}`}>{f.kind}</span>
                  <span className='rp-feature-name'>{f.name}</span>
                  {f.detail && <span className='rp-list-note'>{f.detail}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {room.rest && (room.rest.safety || room.rest.effect) && (
          <div className='rp-field'>
            <span className='rp-label'>resting</span>
            <div className='rp-value'>
              {room.rest.safety && (
                <span className={`rp-safety is-${room.rest.safety}`}>{room.rest.safety}</span>
              )}
              {room.rest.effect && <span> {room.rest.effect}</span>}
            </div>
          </div>
        )}

        {room.links?.length > 0 && (
          <div className='rp-field'>
            <span className='rp-label'>links</span>
            <div className='rp-links'>
              {room.links.map((l, i) => (
                <a key={i} href={l.url} target='_blank' rel='noreferrer' className='rp-link'>
                  <span className='rp-kind'>{l.kind}</span>{l.label}
                </a>
              ))}
            </div>
          </div>
        )}

        <Field label='size'>
          {room.size && (Array.isArray(room.size) ? room.size.join(' × ') : String(room.size))}
        </Field>

        {/* Whatever this room declares, rendered by data. The two hardcoded
            toggles this replaces could not say which enemy or which object, so a
            reset had nothing to act on but the pair of them. */}
        {(room.actions?.length > 0 || progress?.otherSide) && (
          <div className='rp-field'>
            <span className='rp-label'>party</span>
            <div className='rp-value'>
              <div className='rp-toggles'>
                {room.actions?.map(action => (
                  <Toggle
                    key={action.id}
                    on={action.done}
                    onChange={editable ? v => onFlag(action.id, v) : null}
                    tone={TONE[action.kind] ?? null}
                    resetsOn={action.resetsOn}
                  >{action.label}</Toggle>
                ))}
                {!room.actions?.length && (
                  <span className='rp-readonly'>nothing to do here</span>
                )}
              </div>
              <OtherSide progress={progress} />
            </div>
          </div>
        )}

        {(onAddNote || context.note) && (
          <div className='rp-field'>
            <span className='rp-label'>notes</span>
            <div className='rp-value'>
              {context.note && <pre className='rp-note'>{context.note}</pre>}
              {onAddNote && (
              <form className='rp-note-form' onSubmit={submitNote}>
                <input
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  placeholder='add a note…'
                  disabled={loading}
                />
                <button className='btn' type='submit' disabled={loading || !noteDraft.trim()}>
                  add
                </button>
              </form>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
