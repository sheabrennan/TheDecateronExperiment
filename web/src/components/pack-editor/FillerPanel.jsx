import { FILLER_STRATEGIES, FILLER_DISTRIBUTIONS } from '../../../../src/pack/schema.js'
import { FieldError } from './shared.jsx'

function fieldErrors (validation, path) {
  if (!validation) return []
  return [...validation.errors, ...validation.warnings].filter(e => e.path === path)
}

export default function FillerPanel ({ draft, onPatch, validation }) {
  const filler = draft.filler
  const set = fields => onPatch(d => ({ ...d, filler: { ...d.filler, ...fields } }))

  const nonRoleRoomIds = Object.entries(draft.rooms)
    .filter(([, r]) => !r.role)
    .map(([id]) => id)
  const fillerRoomIds = Object.keys(draft.fillerRooms)

  const usingReuseAll = filler.reusePool === '*'
  const reuseList = Array.isArray(filler.reusePool) ? filler.reusePool : []
  const templateList = Array.isArray(filler.templates) ? filler.templates : []

  const toggleIn = (list, id) => list.includes(id) ? list.filter(x => x !== id) : [...list, id]

  const info = validation?.info

  return (
    <div className='builder-room-detail builder-filler'>
      {info?.authoredRooms != null && (
        <div className='hint'>
          {info.authoredRooms} authored{info.fillerNeeded > 0 && <> + {info.fillerNeeded} filled</>} = {info.roomCount ?? 40} rooms
        </div>
      )}

      <div className='builder-panel-section'>
        <div className='builder-field-row' data-tip='How the remaining slots (40 minus authored rooms) get filled: "reuse" repeats authored rooms first, "templates" prefers filler templates first, "mixed" splits roughly 50/50.'>
          <label>Strategy</label>
          <select value={filler.strategy ?? 'reuse'} onChange={e => set({ strategy: e.target.value })}>
            {FILLER_STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <FieldError errors={fieldErrors(validation, 'filler.strategy')} />
        </div>

        <div className='builder-field-row' data-tip='"Spread" round-robins across candidates for maximum variety before anything repeats; "random" draws by weight (see Weights below).'>
          <label>Distribution</label>
          <select value={filler.distribution ?? 'spread'} onChange={e => set({ distribution: e.target.value })}>
            {FILLER_DISTRIBUTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <FieldError errors={fieldErrors(validation, 'filler.distribution')} />
        </div>
      </div>

      <div className='builder-panel-section'>
        <label className='builder-section-heading' data-tip='Not to be confused with "text templates" ({{cellColor}} etc, on the Text templates panel) — these are filler *room* templates, whole rooms this pack can stamp out repeatedly to fill empty slots.'>
          Reuse pool (authored, non-start/exit rooms that may repeat)
        </label>
        <label className='builder-inline-check'>
          <input
            type='checkbox'
            checked={usingReuseAll}
            onChange={e => set({ reusePool: e.target.checked ? '*' : [] })}
          />
          reuse any authored room ("*")
        </label>
        {!usingReuseAll && (
          <div className='builder-chip-row'>
            {nonRoleRoomIds.length === 0 && <span className='hint'>no eligible rooms yet</span>}
            {nonRoleRoomIds.map(id => (
              <button
                type='button' key={id}
                className={`chip toggle ${reuseList.includes(id) ? 'active' : ''}`}
                onClick={() => set({ reusePool: toggleIn(reuseList, id) })}
              >{draft.rooms[id].name || id}</button>
            ))}
          </div>
        )}
        <FieldError errors={fieldErrors(validation, 'filler.reusePool')} />
      </div>

      <div className='builder-panel-section'>
        <label className='builder-section-heading' data-tip="Which filler-room templates (from the left panel) this pack draws repeats from. Leave every chip off to mean 'all of them'.">
          Templates (empty = use all filler templates)
        </label>
        <div className='builder-chip-row'>
          {fillerRoomIds.length === 0 && <span className='hint'>no filler templates yet — add one from the left</span>}
          {fillerRoomIds.map(id => (
            <button
              type='button' key={id}
              className={`chip toggle ${templateList.includes(id) ? 'active' : ''}`}
              onClick={() => set({ templates: toggleIn(templateList, id) })}
            >{draft.fillerRooms[id].name || id}</button>
          ))}
        </div>
        <FieldError errors={fieldErrors(validation, 'filler.templates')} />
      </div>

      {filler.distribution === 'random' && (
        <div className='builder-panel-section'>
          <label className='builder-section-heading' data-tip='Relative draw weight for each candidate when distribution is "random" — higher means more likely, no need to sum to any total.'>
            Weights (random distribution only)
          </label>
          <ul className='builder-weight-rows'>
            {[...new Set([...reuseList, ...templateList, ...(usingReuseAll ? nonRoleRoomIds : [])])].map(id => (
              <li key={id} className='builder-weight-row'>
                <span className='builder-weight-name'>{id}</span>
                <input
                  type='number' min={0}
                  value={filler.weights?.[id] ?? ''}
                  onChange={e => set({ weights: { ...filler.weights, [id]: Number(e.target.value) } })}
                  className='builder-narrow'
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
