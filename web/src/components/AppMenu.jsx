import { useState, useEffect, useRef } from 'react'

// One place for everything that is not a play action, so the action row stays
// down to the things a GM presses every turn.

// Two-value settings as a segmented pill: both states stay visible, and the
// current one is a position rather than a word you have to open a list to read.
function Segmented ({ value, onChange, options, disabled }) {
  return (
    <div className='seg' role='group'>
      {options.map(([key, label]) => (
        <button
          key={key}
          className={value === key ? 'is-on' : ''}
          onClick={() => onChange(key)}
          disabled={disabled}
          aria-pressed={value === key}
        >{label}</button>
      ))}
    </div>
  )
}

export default function AppMenu ({
  game, theme, onTheme, cellChoiceMode, onCellChoiceMode,
  onCatalog, onLog, onExport, onLeave, onReset, loading
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const act = fn => () => { setOpen(false); fn() }

  return (
    <div className='app-menu' ref={ref}>
      <button
        className='btn ghost menu-trigger'
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title='options'
      >☰</button>

      {open && (
        <div className='menu-panel'>
          <div className='menu-section'>
            <span className='menu-heading'>this dungeon</span>
            <div className='menu-meta'>{game?.name}</div>
            <div className='menu-meta dim'>
              {game?.pack?.name} · seed {game?.seed}
            </div>
          </div>

          <div className='menu-section'>
            <span className='menu-heading'>at the table</span>

            <div className='menu-row'>
              <span>Who picks the tesseract</span>
              <Segmented
                value={cellChoiceMode ?? 'gm'}
                onChange={onCellChoiceMode}
                disabled={loading}
                options={[['gm', 'GM'], ['random', 'Chance']]}
              />
            </div>

            <div className='menu-row'>
              <span>Theme</span>
              <Segmented
                value={theme}
                onChange={onTheme}
                options={[['dark', 'Dark'], ['light', 'Light']]}
              />
            </div>
          </div>

          <div className='menu-section'>
            <span className='menu-heading'>reset</span>
            {/* Sweeps the whole dungeon: every action whose pack entry lists this
                event goes back to undone. What comes back is the author's call,
                not the tool's. */}
            <div className='menu-resets'>
              {[
                ['short-rest', 'Short rest'],
                ['long-rest', 'Long rest'],
                // The pack's own resetsOn triggers, e.g. a puzzle pack's
                // "return to start" -- authored in the pack builder, shown here
                // so there's actually a way to fire them at the table.
                ...(game?.resetEvents ?? []).map(e => [e.id, e.label ?? e.id])
              ].map(([event, label]) => (
                <button key={event} className='btn ghost' onClick={act(() => onReset(event))} disabled={loading}>
                  ↻ {label}
                </button>
              ))}
            </div>
          </div>

          <div className='menu-section'>
            <button className='menu-item' onClick={act(onCatalog)}>Both sides of this room</button>
            <button className='menu-item' onClick={act(onLog)}>Session log</button>
            <button className='menu-item' onClick={act(onExport)}>Export save…</button>
            <button className='menu-item' onClick={act(onLeave)}>Back to library</button>
          </div>
        </div>
      )}
    </div>
  )
}
