// A single doorway, seen face-on.
//
// The full cube is the right tool for the room the party is standing in -- all
// six exits are live choices. For the room behind them, or the one through an
// open door, only one face matters: the one they came through or are looking
// through. The other five faces are clutter the GM has to read past.
//
// So this draws that one plane, with the four doors that border it placed where
// they actually are. No rotation, nothing to drag -- the direction labels are
// already spatial, so the diagram can be laid out literally and gravity falls
// to the bottom of the screen on its own.
//
// The awkward case is a doorway in the floor or ceiling. Then "Up" and "Down"
// are the plane itself and its opposite, so neither borders it, and the four
// neighbours are all horizontal. That is exactly the moment a GM needs telling,
// so it is called out rather than quietly drawn flat.

const OPPOSITE = {
  Up: 'Down', Down: 'Up', Left: 'Right', Right: 'Left', Front: 'Back', Back: 'Front'
}

function Neighbour ({ door, place, color }) {
  if (!door) return <span className={`plane-slot is-${place}`} />

  const classes = [
    'plane-slot', `is-${place}`,
    door.isGravity ? 'is-gravity' : '',
    door.wasVisited ? 'is-visited' : ''
  ].filter(Boolean).join(' ')

  return (
    <span className={classes} title={door.targetRoomName}>
      <span className='plane-dir' style={door.isGravity ? { color } : undefined}>
        {door.label}
        {door.isGravity && <span className='plane-grav' title='gravity pulls this way'>▼</span>}
      </span>
      <span className='plane-room'>{door.targetRoomName}</span>
    </span>
  )
}

export default function DoorPlane ({ doors = [], orientation, color, isBehind }) {
  // The face in question: the door they left by if looking back, else the one
  // they are looking through.
  const face = doors.find(d => d.isExitDoor) ?? doors.find(d => d.isEntry)
  if (!face) return null

  const excluded = new Set([face.label, OPPOSITE[face.label]])
  const border = doors.filter(d => !excluded.has(d.label))
  const has = label => border.some(d => d.label === label)
  const at = label => border.find(d => d.label === label)

  // Whichever axis actually borders this face takes the screen's vertical, so
  // a "Down" door is always at the bottom.
  const [top, bottom] = has('Up') ? ['Up', 'Down'] : ['Front', 'Back']
  const [left, right] = has('Left') ? ['Left', 'Right'] : ['Front', 'Back']

  const flat = !has('Up') // the doorway is in the floor or the ceiling
  const gravityIsFace = face.isGravity
  const gravityOpposite = orientation?.gravityLabel === OPPOSITE[face.label]

  // Special gravity still gets direction labels -- lexicalMapper falls back to
  // slot 0 so the six doors stay nameable -- but nothing is actually pulling
  // that way. Without saying so, the GM reads a "Down" door as the floor.
  const specialGravity = (orientation?.gravityIndex ?? 0) < 0

  const note = specialGravity
    ? `Gravity here is ${orientation?.gravityDesc ?? 'special'} — "Down" below is only a naming convention, not a direction.`
    : gravityIsFace
      ? (isBehind
          ? 'This doorway is in the floor — they climbed up out of it.'
          : 'This doorway is in the floor — going through means dropping.')
      : gravityOpposite
        ? (isBehind
            ? 'This doorway is overhead — they pulled themselves up through it.'
            : 'This doorway is overhead — going through means climbing.')
        : flat
          ? 'A doorway in the floor or ceiling: everything bordering it is horizontal.'
          : null

  return (
    <div className='door-plane'>
      <div className={`plane-grid ${specialGravity ? 'is-nominal' : ''}`}>
        <Neighbour door={at(top)} place='top' color={color} />
        <Neighbour door={at(left)} place='left' color={color} />

        <span
          className={`plane-face ${isBehind ? 'is-behind' : ''}`}
          style={{ '--face-color': color }}
        >
          {/* Just the direction. This door's target is always the room the
              party is standing in, and which way they are travelling is
              already stated in the panel beside it. */}
          <span className='plane-face-dir'>{face.label}</span>
        </span>

        <Neighbour door={at(right)} place='right' color={color} />
        <Neighbour door={at(bottom)} place='bottom' color={color} />
      </div>

      {note && <p className='plane-note'>{note}</p>}
    </div>
  )
}
