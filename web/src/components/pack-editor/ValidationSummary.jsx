// Parses a validator finding's `path` (e.g. 'rooms.foo.creatures[2].resetsOn')
// into a selection this editor understands, so clicking a finding jumps there.
function selectionFor (path) {
  if (!path) return null
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  if (segments[0] === 'rooms' && segments[1]) return { kind: 'room', id: segments[1] }
  if (segments[0] === 'fillerRooms' && segments[1]) return { kind: 'fillerRoom', id: segments[1] }
  if (segments[0] === 'manifest' || segments[0] === 'cells') return { kind: 'manifest' }
  if (segments[0] === 'filler' || segments[0] === 'actions') return { kind: 'filler' }
  return null
}

function Row ({ finding, tone, onSelect }) {
  const target = selectionFor(finding.path)
  return (
    <li className={`builder-finding ${tone}`}>
      <button
        className='builder-finding-row'
        onClick={() => target && onSelect(target)}
        disabled={!target}
      >
        <span className='builder-finding-message'>{finding.message}</span>
        {finding.path && <span className='builder-finding-path'>{finding.path}</span>}
      </button>
    </li>
  )
}

export default function ValidationSummary ({ validation, onSelect, draft }) {
  if (!validation) return null
  const { errors, warnings, info } = validation

  return (
    <aside className='builder-validation'>
      <div className='builder-group-heading'>
        {info?.authoredRooms != null && (
          <>
            {info.authoredRooms} authored
            {info.fillerNeeded > 0 && <> + {info.fillerNeeded} filled</>}
            {' → '}{info.roomCount ?? 40} rooms
            {info.cellsWithKeys != null && <> · {info.cellsWithKeys}/10 keyed</>}
          </>
        )}
      </div>

      {errors.length > 0 && (
        <>
          <div className='builder-group-heading'>Errors ({errors.length})</div>
          <ul className='builder-findings'>
            {errors.map((e, i) => <Row key={i} finding={e} tone='danger' onSelect={onSelect} />)}
          </ul>
        </>
      )}

      {warnings.length > 0 && (
        <>
          <div className='builder-group-heading'>Warnings ({warnings.length})</div>
          <ul className='builder-findings'>
            {warnings.map((w, i) => <Row key={i} finding={w} tone='warn' onSelect={onSelect} />)}
          </ul>
        </>
      )}

      {errors.length === 0 && warnings.length === 0 && (
        <div className='hint'>no findings — this pack validates clean</div>
      )}
    </aside>
  )
}
