import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { api } from '../api.js'
import { validatePack } from '../../../src/pack/validate.js'
import RoomList from './pack-editor/RoomList.jsx'
import RoomDetail from './pack-editor/RoomDetail.jsx'
import ManifestPanel from './pack-editor/ManifestPanel.jsx'
import FillerPanel from './pack-editor/FillerPanel.jsx'
import TemplateVarsPanel from './pack-editor/TemplateVarsPanel.jsx'
import ValidationSummary from './pack-editor/ValidationSummary.jsx'

const LAYOUT_KEY = 'tde.builder.layout'
const LAYOUT_DEFAULTS = { leftWidth: 220, rightWidth: 280, leftCollapsed: false, rightCollapsed: false }
const MIN_PANEL_WIDTH = 160
const MAX_PANEL_WIDTH = 520

function loadLayout () {
  try {
    return { ...LAYOUT_DEFAULTS, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') }
  } catch {
    return { ...LAYOUT_DEFAULTS }
  }
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

// The full editor. `draft` is the single source of truth while editing --
// mutated immutably in memory, only touching storage on an explicit Save.
// Validation runs continuously (it never throws and is cheap); warnings never
// block saving, and neither do errors -- a pack in progress is still a draft.
export default function PackEditor ({ packId, onBack, onExit }) {
  const [draft, setDraft] = useState(null)
  const [savedId, setSavedId] = useState(packId)
  const [selection, setSelection] = useState({ kind: 'manifest' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [dirty, setDirty] = useState(false)

  const [layout, setLayout] = useState(loadLayout)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  useEffect(() => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  }, [layout])

  // Imperative drag: window listeners are added on mousedown and torn down on
  // mouseup, rather than tracked through React state on every pixel of
  // movement -- a re-render per mousemove is wasted work when only the final
  // width matters once the drag ends.
  const startResize = useCallback(side => e => {
    e.preventDefault()
    const startX = e.clientX
    const key = side === 'left' ? 'leftWidth' : 'rightWidth'
    const startWidth = layoutRef.current[key]
    const onMove = moveEvent => {
      const delta = moveEvent.clientX - startX
      const next = clamp(startWidth + (side === 'left' ? delta : -delta), MIN_PANEL_WIDTH, MAX_PANEL_WIDTH)
      setLayout(l => ({ ...l, [key]: next }))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const toggleCollapsed = side => setLayout(l => ({
    ...l,
    [side === 'left' ? 'leftCollapsed' : 'rightCollapsed']: !l[side === 'left' ? 'leftCollapsed' : 'rightCollapsed']
  }))

  useEffect(() => {
    let live = true
    api.loadPackDraft(packId).then(pack => {
      if (!live) return
      setDraft(pack)
      setSavedId(pack.manifest.id)
      setDirty(false)
    }).catch(err => live && setError(err.message))
    return () => { live = false }
  }, [packId])

  const validation = useMemo(() => (draft ? validatePack(draft) : null), [draft])

  const patch = useCallback(updater => {
    setDraft(d => {
      const next = typeof updater === 'function' ? updater(d) : { ...d, ...updater }
      return next
    })
    setDirty(true)
  }, [])

  const handleSave = useCallback(() => {
    setBusy(true)
    setError(null)
    api.savePackDraft(draft.manifest.id !== savedId ? { ...draft, __previousId: savedId } : draft)
      .then(saved => {
        setDraft(saved)
        setSavedId(saved.manifest.id)
        setDirty(false)
        setBusy(false)
      })
      .catch(err => {
        setError(err.message)
        setBusy(false)
      })
  }, [draft, savedId])

  const handleExport = useCallback(() => {
    const blob = new Blob([api.exportPackDraft(draft)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(draft.manifest.id || 'pack').replace(/[^\w-]+/g, '-')}.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [draft])

  if (!draft) {
    return (
      <div className='game-selector library builder-editor'>
        {error ? <div className='error'>{error}</div> : <div className='hint'>loading…</div>}
        <button className='btn ghost' onClick={onBack}>Back to packs</button>
      </div>
    )
  }

  const errorCount = validation?.errors.length ?? 0

  return (
    <div className='builder-editor'>
      <header className='builder-bar'>
        <span className='builder-title'>{draft.manifest.name}</span>
        <span className={`chip ${errorCount ? 'danger' : 'ok'}`}>
          {errorCount ? `${errorCount} error${errorCount === 1 ? '' : 's'}` : 'valid'}
        </span>
        <div className='builder-bar-actions'>
          {error && <span className='error-text'>{error}</span>}
          <button className='btn primary' onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : dirty ? 'Save*' : 'Save'}
          </button>
          <button className='btn ghost' onClick={handleExport} disabled={busy} data-tip='download this pack as a .json file'>
            Export…
          </button>
          <button className='btn ghost' onClick={onBack} disabled={busy}>Back to packs</button>
          <button className='btn ghost' onClick={onExit} disabled={busy}>Back to library</button>
        </div>
      </header>

      <div className='builder-shell'>
        <div
          className={`builder-side ${layout.leftCollapsed ? 'is-collapsed' : ''}`}
          style={{ width: layout.leftCollapsed ? undefined : layout.leftWidth }}
        >
          <button
            className='builder-panel-toggle'
            onClick={() => toggleCollapsed('left')}
            title={layout.leftCollapsed ? 'expand room list' : 'collapse room list'}
          >
            {layout.leftCollapsed ? '»' : '«'}
          </button>
          {!layout.leftCollapsed && (
            <RoomList
              draft={draft}
              selection={selection}
              onSelect={setSelection}
              onPatch={patch}
              validation={validation}
            />
          )}
        </div>
        {!layout.leftCollapsed && <div className='builder-resize-handle' onMouseDown={startResize('left')} />}

        <section className='builder-detail'>
          {selection.kind === 'manifest' && (
            <ManifestPanel draft={draft} onPatch={patch} validation={validation} />
          )}
          {selection.kind === 'filler' && (
            <FillerPanel draft={draft} onPatch={patch} validation={validation} />
          )}
          {selection.kind === 'templates' && (
            <TemplateVarsPanel draft={draft} onPatch={patch} validation={validation} />
          )}
          {(selection.kind === 'room' || selection.kind === 'fillerRoom') && (
            <RoomDetail
              key={`${selection.kind}:${selection.id}`}
              draft={draft}
              onPatch={patch}
              onSelect={setSelection}
              validation={validation}
              selection={selection}
              isFiller={selection.kind === 'fillerRoom'}
            />
          )}
        </section>

        {!layout.rightCollapsed && <div className='builder-resize-handle' onMouseDown={startResize('right')} />}
        <div
          className={`builder-side ${layout.rightCollapsed ? 'is-collapsed' : ''}`}
          style={{ width: layout.rightCollapsed ? undefined : layout.rightWidth }}
        >
          <button
            className='builder-panel-toggle'
            onClick={() => toggleCollapsed('right')}
            title={layout.rightCollapsed ? 'expand warnings' : 'collapse warnings'}
          >
            {layout.rightCollapsed ? '«' : '»'}
          </button>
          {!layout.rightCollapsed && (
            <ValidationSummary validation={validation} onSelect={setSelection} draft={draft} />
          )}
        </div>
      </div>
    </div>
  )
}
