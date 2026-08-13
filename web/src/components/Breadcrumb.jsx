import { useState, useRef, useEffect, useCallback } from 'react'
import { ink } from '../ink.js'

// The trail, newest first.
//
// Reading order runs backwards in time: where the party is now sits at the
// left, and each step further right is a step further back. Older crumbs fade,
// so depth in the dungeon is legible without counting.
//
// The popover holds a rewind button, so hover alone cannot drive it -- the
// pointer has to cross a gap to reach the button, and a naive hover-out would
// close it on the way. It stays open while the pointer is over either the crumb
// or the popover, and closes on a short grace delay after leaving both. Clicking
// pins it open, which is also the only thing that works on a touch screen.

const OPEN_DELAY = 110
const CLOSE_DELAY = 220

// Enough fade to read as age, never so much that a crumb becomes unreadable.
const ageOpacity = index => Math.max(0.38, 1 - index * 0.085)

export default function Breadcrumb ({ moves = [], currentRoom, currentCell, onRewind }) {
  const [active, setActive] = useState(null) // { index, left, pinned }
  const scrollRef = useRef(null)
  const crumbRefs = useRef([])
  const timers = useRef({ open: null, close: null })

  const clearTimers = () => {
    clearTimeout(timers.current.open)
    clearTimeout(timers.current.close)
  }
  useEffect(() => clearTimers, [])

  // Newest first, so the newest crumb is the one at the left edge.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0
  }, [moves?.length])

  const positionFor = index => {
    const el = crumbRefs.current[index]
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    return Math.max(8, Math.min(rect.left, window.innerWidth - 260))
  }

  const openAt = useCallback((index, { pinned = false } = {}) => {
    clearTimers()
    setActive({ index, left: positionFor(index), pinned })
  }, [])

  const scheduleOpen = index => {
    clearTimeout(timers.current.close)
    timers.current.open = setTimeout(() => openAt(index), OPEN_DELAY)
  }

  const scheduleClose = () => {
    clearTimeout(timers.current.open)
    timers.current.close = setTimeout(() => {
      setActive(a => (a?.pinned ? a : null))
    }, CLOSE_DELAY)
  }

  const togglePin = index => {
    clearTimers()
    setActive(a => (a?.index === index && a.pinned
      ? null
      : { index, left: positionFor(index), pinned: true }))
  }

  // Dismiss a pinned popover on an outside click.
  useEffect(() => {
    if (!active?.pinned) return
    const onDown = e => {
      if (!e.target.closest('.crumb-btn') && !e.target.closest('.crumb-popover')) {
        setActive(null)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [active?.pinned])

  // moves[0] is the room they were in a moment ago, so getting back to moves[i]
  // is i + 1 steps.
  const crumb = active ? moves[active.index] : null

  return (
    <div className='breadcrumb-bar'>
      <div className='crumb-scroll' ref={scrollRef}>
        {currentRoom && (
          <>
            <span
              className='crumb-current'
              style={{ color: currentCell?.color ? ink(currentCell.color) : 'var(--cell-ink)' }}
            >
              {currentRoom.name}
            </span>
            {moves.length > 0 && <span className='crumb-sep'>‹</span>}
          </>
        )}

        {moves.map((move, i) => (
          <span key={i} className='crumb-item'>
            <button
              ref={el => { crumbRefs.current[i] = el }}
              className={`crumb-btn${active?.index === i ? ' active' : ''}`}
              style={{
                color: move.cellColor ? ink(move.cellColor) : undefined,
                opacity: active?.index === i ? 1 : ageOpacity(i)
              }}
              onMouseEnter={() => scheduleOpen(i)}
              onMouseLeave={scheduleClose}
              onFocus={() => openAt(i)}
              onClick={() => togglePin(i)}
            >
              {move.roomName}
            </button>
            {i < moves.length - 1 && <span className='crumb-sep'>‹</span>}
          </span>
        ))}
      </div>

      {crumb && (
        <div
          className='crumb-popover'
          style={{ left: active.left }}
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
        >
          <div
            className='crumb-popover-name'
            style={{ color: crumb.cellColor ? ink(crumb.cellColor) : 'var(--text)' }}
          >
            {crumb.roomName}
          </div>
          <div className='crumb-popover-meta'>
            {crumb.cellName ?? `cell ${crumb.cellId}`}
          </div>
          <div className='crumb-popover-meta'>entered: {crumb.entryLabel}</div>

          {/* What the party left behind, so the GM can answer "did we finish
              with that one?" without walking back into it. */}
          <div className='crumb-status'>
            {crumb.creatures?.length > 0 && (
              <div className={crumb.state?.cleared ? 'is-done' : 'is-open'}>
                {crumb.state?.cleared ? '✓' : '⚔'} {crumb.creatures.join(', ')}
                {!crumb.state?.cleared && ' — not cleared'}
              </div>
            )}
            {crumb.holdsKey && (
              <div className={crumb.state?.looted ? 'is-done' : 'is-open'}>
                {crumb.state?.looted ? '✓ key taken' : '⚷ key still here'}
              </div>
            )}
            {!crumb.creatures?.length && !crumb.holdsKey && crumb.state?.looted && (
              <div className='is-done'>✓ searched</div>
            )}
          </div>

          {crumb.note && <pre className='crumb-note'>{crumb.note}</pre>}

          <button
            className='crumb-popover-rewind'
            onClick={() => { onRewind(active.index + 1); setActive(null) }}
            title='reversible — Forward puts it back'
          >
            ↩ rewind here
          </button>
        </div>
      )}
    </div>
  )
}
