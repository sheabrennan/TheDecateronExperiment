import { useState, useEffect } from 'react'
import { ink, line } from '../ink.js'
import { api } from '../api.js'

// Both tesseract versions of the current room, side by side, with full room
// text for every door.  Ported from the CLI's `catalog` command, which was the
// richest GM-facing view in the codebase and had no web equivalent -- it would
// have been deleted along with the CLI.
//
// This is the view that makes the two-tesseract structure legible: the same
// six doors, the same six positions, two completely different sets of rooms
// behind them.

export default function CatalogPanel ({ open, onClose }) {
  const [cells, setCells] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    let live = true
    api.getCatalog()
      .then(data => { if (live) setCells(data) })
      .catch(err => { if (live) setError(err.message) })
    return () => { live = false }
  }, [open])

  if (!open) return null

  return (
    <div className='catalog-overlay' onClick={onClose}>
      <div className='catalog' onClick={e => e.stopPropagation()}>
        <div className='catalog-head'>
          <h2>Both sides of this room</h2>
          <button className='btn ghost' onClick={onClose}>close</button>
        </div>

        {error && <div className='error'>{error}</div>}

        <div className='catalog-cells'>
          {(cells ?? []).map(cell => (
            <section key={cell.id} className='catalog-cell' style={{ '--cell-color': line(cell.color) }}>
              <header style={{ color: ink(cell.color) }}>
                <span className='door-swatch' style={{ background: cell.color }} />
                {cell.colorName ?? `cell ${cell.id}`}
                {cell.isCurrent && <span className='chip'>you are here</span>}
                {cell.position && <span className='catalog-position'>{cell.position}</span>}
              </header>

              <ol className='catalog-doors'>
                {cell.doors.map(door => (
                  <li key={door.index} className={door.isEntry ? 'is-entry' : ''}>
                    <div className='catalog-door-head'>
                      <span className='catalog-label'>{door.label}</span>
                      <span className='catalog-name'>{door.name}</span>
                      {door.hasKey && <span className='chip key'>⚷ key</span>}
                      {door.isEntry && <span className='chip'>entry</span>}
                      {door.wasVisited && <span className='chip muted'>visited</span>}
                    </div>
                    {door.room?.read && <p className='catalog-desc'>{door.room.read}</p>}
                    {door.room?.creatures?.map((c, i) => (
                      <p key={i} className='catalog-danger'>
                        ⚔ {c.count ? `${c.count} ` : ''}{c.name}
                      </p>
                    ))}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
