import { looseSlugify } from '../../../../src/pack/schema.js'
import { FieldError, ActionsEditor, AutoTextarea, confirmRemoveResetEvent } from './shared.jsx'

function fieldErrors (validation, path) {
  if (!validation) return []
  return [...validation.errors, ...validation.warnings].filter(e => e.path === path)
}

export default function ManifestPanel ({ draft, onPatch, validation }) {
  const manifest = draft.manifest
  const setManifest = fields => onPatch(d => ({ ...d, manifest: { ...d.manifest, ...fields } }))

  const setColor = (i, fields) => onPatch(d => {
    const colors = [...d.cells.colors]
    colors[i] = { ...colors[i], ...fields }
    return { ...d, cells: { ...d.cells, colors } }
  })

  const actions = draft.actions ?? []
  const setActions = next => onPatch(d => ({ ...d, actions: next }))

  const resetEvents = draft.resetEvents ?? []
  const setResetEvents = next => onPatch(d => ({ ...d, resetEvents: next }))

  return (
    <div className='builder-room-detail'>
      <div className='builder-field-row' data-tip="The pack's unique id. Used as its storage key and the value packId resolves to when starting a game — changing it moves the pack under a new key.">
        <label>Pack id (slug)</label>
        <input
          value={manifest.id ?? ''}
          onChange={e => setManifest({ id: looseSlugify(e.target.value) })}
        />
        <FieldError errors={fieldErrors(validation, 'manifest.id')} />
      </div>

      <div className='builder-field-row' data-tip="The display name shown in the library's pack picker.">
        <label>Name</label>
        <input value={manifest.name ?? ''} onChange={e => setManifest({ name: e.target.value })} />
        <FieldError errors={fieldErrors(validation, 'manifest.name')} />
      </div>

      <div className='builder-field-row' data-tip="A free-text version string (e.g. semver) — purely informational, the engine never compares it.">
        <label>Version</label>
        <input value={manifest.version ?? ''} onChange={e => setManifest({ version: e.target.value })} />
        <FieldError errors={fieldErrors(validation, 'manifest.version')} />
      </div>

      <div className='builder-field-row' data-tip="Credited authors, comma-separated.">
        <label>Authors (comma-separated)</label>
        <input
          value={(manifest.authors ?? []).join(', ')}
          onChange={e => setManifest({ authors: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
        />
      </div>

      <div className='builder-field-row' data-tip="e.g. 'CC-BY-4.0' or 'All rights reserved'. A CC-BY license requires an attribution notice below.">
        <label>License</label>
        <input value={manifest.license ?? ''} onChange={e => setManifest({ license: e.target.value })} />
      </div>

      <div className='builder-field-row' data-tip="The attribution notice CC-licensed content requires to travel with the work — required if License starts with CC-BY.">
        <label>Attribution</label>
        <AutoTextarea value={manifest.attribution ?? ''} onChange={e => setManifest({ attribution: e.target.value })} />
        <FieldError errors={fieldErrors(validation, 'manifest.attribution')} />
      </div>

      <div className='builder-field-row' data-tip="Shown under the pack's name in the library — a one-line pitch for what this dungeon is.">
        <label>Description</label>
        <AutoTextarea value={manifest.description ?? ''} onChange={e => setManifest({ description: e.target.value })} />
      </div>

      <div className='builder-field-row' data-tip="Free text naming the ruleset this pack is written for, e.g. '5e'. Purely descriptive — the engine never reads it.">
        <label>System tag</label>
        <input value={manifest.systemTag ?? ''} onChange={e => setManifest({ systemTag: e.target.value })} placeholder='e.g. 5e' />
      </div>

      <div className='builder-field-row column'>
        <label data-tip="One color per tesseract (cell) — the in-fiction tell for which of the 10 cells the party is standing in. Duplicates are allowed but discouraged unless this pack doesn't lean on color as a signal.">
          Cell colors (exactly 10)
        </label>
        <ul className='builder-sub-list'>
          {draft.cells.colors.map((c, i) => (
            <li key={i} className='builder-list-row'>
              <input type='color' value={c.hex ?? '#888888'} onChange={e => setColor(i, { hex: e.target.value })} />
              <input value={c.name ?? ''} onChange={e => setColor(i, { name: e.target.value })} placeholder={`Cell ${i + 1}`} />
            </li>
          ))}
        </ul>
        <FieldError errors={fieldErrors(validation, 'cells.colors')} />
      </div>

      <div className='builder-field-row column'>
        <label data-tip='Every room offers these actions (e.g. "searched") unless it declares its own actions list on the Room panel — an empty override list suppresses them entirely for that room.'>
          Pack-level actions (offered by every room, unless overridden)
        </label>
        <ActionsEditor actions={actions} onChange={setActions} customEvents={resetEvents} />
        <FieldError errors={fieldErrors(validation, 'actions')} />
      </div>

      <div className='builder-field-row column'>
        <label data-tip={'Custom resetsOn triggers beyond the built-in short-rest/long-rest/key/doors/shuffle — e.g. a puzzle pack\'s own "return to start". Each one needs to be fired by the GM from the in-game menu, which happens automatically once declared here.'}>
          Custom reset events
        </label>
        <ul className='builder-sub-list'>
          {resetEvents.map((e, i) => (
            <li key={i} className='builder-list-row'>
              <input
                value={e.id ?? ''}
                onChange={ev => setResetEvents(resetEvents.map((x, j) => j === i ? { ...x, id: looseSlugify(ev.target.value) } : x))}
                placeholder='id'
                className='builder-narrow'
                data-tip='the event name a resetsOn list refers to, e.g. "return-to-start"'
              />
              <input
                value={e.label ?? ''}
                onChange={ev => setResetEvents(resetEvents.map((x, j) => j === i ? { ...x, label: ev.target.value } : x))}
                placeholder='label'
                data-tip='what the GM sees on the reset button in the menu'
              />
              <button type='button' className='btn ghost' onClick={() => confirmRemoveResetEvent(draft, onPatch, e)}>×</button>
            </li>
          ))}
        </ul>
        <button
          type='button' className='btn ghost'
          onClick={() => setResetEvents([...resetEvents, { id: uniqueEventId(resetEvents), label: '' }])}
        >+ add reset event</button>
        <FieldError errors={fieldErrors(validation, 'resetEvents')} />
      </div>
    </div>
  )
}

function uniqueEventId (existing) {
  const taken = new Set(existing.map(e => e.id))
  let n = existing.length + 1
  while (taken.has(`event-${n}`)) n++
  return `event-${n}`
}
