// 3D CSS cube diagram.
//
// The six faces map direction labels (Up/Down/Front/Back/Left/Right) to the
// corresponding face of a CSS 3D cube. Faces are highlighted based on their
// role: entry (E), open door (O), gravity direction (G), visited (V/v).
//
// Drag to rotate. Double-click to reset the view.
// Optional faceSize prop (default 140) scales the whole cube down for preview use.

import { useState, useRef, useEffect, useCallback } from 'react'

const CONTAINER  = 300           // reference container size at faceSize=140
const DEFAULT_ROT = { x: -28, y: 38 }

// Maps a direction label → which CSS face it belongs to
const DIR_TO_FACE = {
  Up:    'top',
  Down:  'bottom',
  Front: 'front',
  Back:  'back',
  Left:  'left',
  Right: 'right'
}

function hexToRgba (hex, alpha) {
  const h = (hex || '#888888').replace('#', '').padEnd(6, '0')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function CubeFace ({ faceName, door, cellColor, half, faceSize, faceTransform }) {
  const dirName = Object.keys(DIR_TO_FACE).find(d => DIR_TO_FACE[d] === faceName)
  const isEntry        = door?.isEntry        ?? false
  const isOpen         = door?.isOpen         ?? false
  const isGravity      = door?.isGravity      ?? false
  const isExitDoor     = door?.isExitDoor      ?? false
  const wasVisited     = door?.wasVisited      ?? false
  const wasVisitedAny  = door?.wasVisitedAnyCell ?? false

  // On the room behind the party, the door they LEFT by is the one to point at.
  const bg = isOpen || isExitDoor
    ? hexToRgba(cellColor, 0.78)
    : isEntry
      ? hexToRgba(cellColor, 0.48)
      : 'var(--cube-face)'

  const borderColor = isOpen || isExitDoor
    ? cellColor
    : isEntry
      ? hexToRgba(cellColor, 0.9)
      : 'var(--cube-edge)'

  const borderWidth = isOpen || isEntry || isExitDoor ? 2 : 1

  const labelColor = isOpen || isEntry || isExitDoor ? 'var(--cube-label-on)' : 'var(--cube-label)'

  // E/G/O badges always first, then visit badges
  const rolesBadges   = [isEntry && 'E', isGravity && 'G', isOpen && 'O'].filter(Boolean)
  const visitedBadge  = wasVisited ? 'V' : wasVisitedAny ? 'v' : null

  const labelSize  = Math.round(faceSize * 0.121)   // ~17px at 140
  const badgeSize  = Math.round(faceSize * 0.079)   // ~11px at 140
  const targetSize = Math.round(faceSize * 0.071)   // ~10px at 140

  return (
    <div
      style={{
        position:          'absolute',
        width:             faceSize,
        height:            faceSize,
        transform:         faceTransform[faceName],
        background:        bg,
        border:            `${borderWidth}px solid ${borderColor}`,
        boxSizing:         'border-box',
        backfaceVisibility:'hidden',
        display:           'flex',
        flexDirection:     'column',
        alignItems:        'center',
        justifyContent:    'center',
        gap:               Math.round(faceSize * 0.029),
        padding:           `0 ${Math.round(faceSize * 0.071)}px`,
        boxShadow:         isOpen || isEntry
                             ? `inset 0 0 ${Math.round(faceSize * 0.171)}px ${hexToRgba(cellColor, 0.25)}`
                             : 'none',
      }}
    >
      {/* Direction label */}
      <div style={{
        color:        labelColor,
        fontFamily:   'monospace',
        fontWeight:   'bold',
        fontSize:     labelSize,
        letterSpacing: 1,
      }}>
        {dirName}
      </div>

      {/* E / G / O badges */}
      {rolesBadges.length > 0 && (
        <div style={{
          color:      cellColor,
          fontFamily: 'monospace',
          fontSize:   badgeSize,
          letterSpacing: 1,
        }}>
          {rolesBadges.map(b => `(${b})`).join(' ')}
        </div>
      )}

      {/* V / v visit badge */}
      {visitedBadge && (
        <div style={{
          color:      'var(--seen)',
          opacity:    wasVisited ? 1 : 0.6,
          fontFamily: 'monospace',
          fontSize:   badgeSize,
          letterSpacing: 1,
        }}>
          ({visitedBadge})
        </div>
      )}

      {/* Target room name */}
      {door?.targetRoomName && (
        <div style={{
          color:        'var(--cube-sublabel)',
          fontFamily:   'monospace',
          fontSize:     targetSize,
          textAlign:    'center',
          maxWidth:     '100%',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
          marginTop:    2,
        }}>
          {door.targetRoomName}
        </div>
      )}

      {/* Gravity corner dot when face is neither entry nor open */}
      {isGravity && !isEntry && !isOpen && (
        <div style={{
          position:     'absolute',
          top:          Math.round(faceSize * 0.057),
          right:        Math.round(faceSize * 0.057),
          width:        Math.round(faceSize * 0.064),
          height:       Math.round(faceSize * 0.064),
          borderRadius: '50%',
          background:   hexToRgba(cellColor, 0.85),
          boxShadow:    `0 0 ${Math.round(faceSize * 0.043)}px ${cellColor}`,
        }} />
      )}
    </div>
  )
}

// Keeps angles in (-180, 180] so a cube spun many turns stays comparable to
// one that has not.
function wrap (deg) {
  const d = ((deg + 180) % 360 + 360) % 360 - 180
  return Math.round(d * 100) / 100
}

export default function CubeDiagram ({ doors = [], cellColor = '#8888cc', faceSize = 140 }) {
  const half      = faceSize / 2
  const container = Math.round(faceSize * (CONTAINER / 140))

  const faceTransform = {
    front:  `translateZ(${half}px)`,
    back:   `rotateY(180deg) translateZ(${half}px)`,
    left:   `rotateY(-90deg) translateZ(${half}px)`,
    right:  `rotateY(90deg) translateZ(${half}px)`,
    top:    `rotateX(90deg) translateZ(${half}px)`,
    bottom: `rotateX(-90deg) translateZ(${half}px)`,
  }

  const [rot, setRot] = useState(DEFAULT_ROT)

  const [isDragging, setDragging] = useState(false)
  const lastPos = useRef({ x: 0, y: 0 })
  const frameRef = useRef(null)

  // Index doors by their direction label for O(1) lookup
  const byLabel = {}
  doors.forEach(d => { byLabel[d.label] = d })

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const startDrag = useCallback((clientX, clientY) => {
    lastPos.current = { x: clientX, y: clientY }
    setDragging(true)
  }, [])

  const moveDrag = useCallback((clientX, clientY) => {
    const dx = clientX - lastPos.current.x
    const dy = clientY - lastPos.current.y
    lastPos.current = { x: clientX, y: clientY }

    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      // Free rotation on both axes. Clamping X to +/-89 stopped the cube ever
      // being turned over, so a door on the underside could not be brought
      // into view -- exactly the case a GM most needs to look at.
      setRot(prev => ({
        x: wrap(prev.x - dy * 0.45),
        y: wrap(prev.y + dx * 0.45),
      }))
    })
  }, [setRot])

  const endDrag = useCallback(() => setDragging(false), [])

  useEffect(() => {
    const onMouseMove = (e) => { if (isDragging) moveDrag(e.clientX, e.clientY) }
    const onMouseUp   = () => { if (isDragging) endDrag() }
    const onTouchMove = (e) => {
      if (isDragging) moveDrag(e.touches[0].clientX, e.touches[0].clientY)
    }
    const onTouchEnd = () => { if (isDragging) endDrag() }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend',  onTouchEnd)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend',  onTouchEnd)
    }
  }, [isDragging, moveDrag, endDrag])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ userSelect: 'none' }}>
      {/* Scene — establishes perspective for child 3D transforms */}
      <div
        style={{
          width:       container,
          height:      container,
          perspective: Math.round(container * 2.33),
          cursor:      isDragging ? 'grabbing' : 'grab',
          margin:      '0 auto',
          filter:      `drop-shadow(0 0 ${Math.round(faceSize * 0.129)}px ${hexToRgba(cellColor, 0.18)})`,
        }}
        onMouseDown={e => startDrag(e.clientX, e.clientY)}
        onTouchStart={e => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
        onDoubleClick={() => setRot(DEFAULT_ROT)}
      >
        {/* Cube — rotates in 3D space, centered in the scene */}
        <div
          style={{
            width:          faceSize,
            height:         faceSize,
            position:       'relative',
            transformStyle: 'preserve-3d',
            transform:      `
              translate(${(container - faceSize) / 2}px, ${(container - faceSize) / 2}px)
              rotateX(${rot.x}deg)
              rotateY(${rot.y}deg)
            `,
            transition: isDragging ? 'none' : 'transform 0.08s ease-out',
          }}
        >
          {Object.keys(faceTransform).map(faceName => {
            const dirName = Object.keys(DIR_TO_FACE).find(d => DIR_TO_FACE[d] === faceName)
            return (
              <CubeFace
                key={faceName}
                faceName={faceName}
                door={dirName ? (byLabel[dirName] ?? null) : null}
                cellColor={cellColor}
                half={half}
                faceSize={faceSize}
                faceTransform={faceTransform}
              />
            )
          })}
        </div>
      </div>

      {/* Hint */}
      <div style={{
        textAlign:    'center',
        fontSize:     Math.round(faceSize * 0.071),
        color:        'var(--cube-hint)',
        marginTop:    2,
        fontFamily:   'monospace',
        letterSpacing: 1,
      }}>
        drag to rotate · double-click to reset
      </div>
    </div>
  )
}
