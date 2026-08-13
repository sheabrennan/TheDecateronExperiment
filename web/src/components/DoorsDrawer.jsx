import { useEffect } from 'react'
import { ink, line } from '../ink.js'

// The six doors, as a drawer that gets out of the way.
//
// The door list is used for one beat per turn -- choose, open -- and then the
// GM is reading and describing for minutes. It slides away after a choice so
// the room text gets the screen, and slides back on demand.
//
// In `gm` mode the two tesseracts are columns, so the same six doors sit beside
// their two different sets of destinations: the two-tesseract structure is the
// shape of the list rather than something to remember. Each destination is
// tinted with the colour of the tesseract it opens into -- the tell the players
// see when a door lights on contact.
//
// In `random` mode the destinations are withheld; chance picks when the door is
// opened and the preview reveals where it went.

function Destination ({ option, isOpen, onSelect }) {
  const { cell } = option

  const classes = [
    'door-dest',
    isOpen ? 'is-open' : '',
    option.isExit ? 'is-exit' : '',
    option.wasVisited ? 'is-visited' : ''
  ].filter(Boolean).join(' ')

  const title = [
    `through the ${cell.colorName ?? `cell ${cell.id}`} tesseract`,
    option.wasVisited
      ? 'the party has been here, this side'
      : option.wasVisitedAnyCell ? 'the party has seen this room, other side' : null,
    option.targetHasKey ? "holds this tesseract's key" : null,
    option.isExit ? 'THE EXIT' : null
  ].filter(Boolean).join(' · ')

  return (
    <button
      className={classes}
      style={{ '--dest-color': line(cell.color), '--dest-raw': cell.color }}
      onClick={onSelect}
      title={title}
    >
      <span className='door-swatch' style={{ background: cell.color }} />
      <span className='door-dest-name'>{option.targetRoomName}</span>
      {option.targetHasKey && <span className='door-flag key' title='key room'>⚷</span>}
      {option.isExit && <span className='door-flag exit' title='the exit'>⊕</span>}
      {option.isOnShortestPath && <span className='door-flag path' title='toward the exit'>→</span>}
      {option.wasVisited
        ? <span className='door-flag seen' title='visited, this tesseract'>V</span>
        : option.wasVisitedAnyCell
          ? <span className='door-flag seen faint' title='visited, other tesseract'>v</span>
          : null}
    </button>
  )
}

export default function DoorsDrawer ({
  doors, openDoor, onSelectDoor, open, onToggle, loading
}) {
  // Esc closes it, like any overlay.
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onToggle(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onToggle])

  if (!doors?.doors?.length) return null

  const { mode, cells } = doors
  const revealed = mode !== 'random'

  const select = (index, cellId) => {
    if (loading) return
    onSelectDoor(index, cellId)
    onToggle(false) // step out of the way; the GM is about to read.
  }

  return (
    <div className={`doors-drawer ${open ? 'is-open' : ''}`}>
      <button className='doors-handle' onClick={() => onToggle(!open)}>
        <span className='nav-label'>Doors</span>
        {revealed
          ? (
            <span className='doors-handle-cells'>
              {cells.map(cell => (
                <span key={cell.id} style={{ color: ink(cell.color) }}>
                  <span className='door-swatch' style={{ background: cell.color }} />
                  {cell.colorName ?? cell.id}
                </span>
              ))}
            </span>
            )
          : null}
        <span className='doors-chevron'>{open ? '▾' : '▴'}</span>
      </button>

      <div className={`doors ${revealed ? 'is-revealed' : 'is-blind'}`}>
        {revealed && (
          <div className='doors-head'>
            <span />
            {cells.map(cell => (
              <span key={cell.id} className='doors-col-head' style={{ color: ink(cell.color) }}>
                <span className='door-swatch' style={{ background: cell.color }} />
                {cell.colorName ?? `cell ${cell.id}`}
              </span>
            ))}
          </div>
        )}

        {doors.doors.map(door => (
          <div className='door-row' key={door.index}>
            <span className='door-dir'>
              {door.label}
              {door.isEntry && <span className='door-badge is-entry' title='the door you came in by'>E</span>}
              {door.isGravity && <span className='door-badge is-gravity' title='gravity pulls this way'>G</span>}
            </span>

            {revealed
              ? door.options.map(option => (
                  <Destination
                    key={option.cell.id}
                    option={option}
                    isOpen={openDoor?.index === door.index && openDoor?.cellId === option.cell.id}
                    onSelect={() => select(door.index, option.cell.id)}
                  />
                ))
              : (
                <button
                  className={`door-dest is-blind ${openDoor?.index === door.index ? 'is-open' : ''}`}
                  onClick={() => select(door.index, null)}
                  title='open this door and let chance choose the tesseract'
                >
                  open →
                </button>
                )}
          </div>
        ))}
      </div>
    </div>
  )
}
