import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api.js'
import PackEditor from './PackEditor.jsx'

const when = iso => {
  if (!iso) return ''
  const date = new Date(iso)
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return date.toLocaleDateString()
}

export default function PackBuilder ({ onExit }) {
  const [packs, setPacks] = useState([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const fileInput = useRef(null)

  const refresh = useCallback(async () => {
    setPacks(await api.listPacks())
  }, [])

  useEffect(() => {
    refresh().catch(err => setError(err.message))
  }, [refresh])

  const run = useCallback(async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [])

  const handleCreate = e => {
    e.preventDefault()
    run(async () => {
      const draft = await api.createPackDraft({ name })
      setName('')
      await refresh()
      setEditingId(draft.manifest.id)
    })
  }

  const handleDuplicate = fromId => {
    run(async () => {
      const source = packs.find(p => p.id === fromId)
      const draft = await api.createPackDraft({ fromId, name: `${source?.name ?? fromId} copy` })
      await refresh()
      setEditingId(draft.manifest.id)
    })
  }

  const handleOpen = id => setEditingId(id)

  const handleDelete = (id, packName) => {
    if (!window.confirm(`Delete "${packName}"? This cannot be undone.`)) return
    run(async () => {
      await api.deleteUserPack(id)
      await refresh()
    })
  }

  const handleExport = (id, packName) => {
    run(async () => {
      const pack = await api.loadPackDraft(id)
      const blob = new Blob([api.exportPackDraft(pack)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${(pack.manifest.id || packName || 'pack').replace(/[^\w-]+/g, '-')}.json`
      link.click()
      URL.revokeObjectURL(url)
    })
  }

  const handleImport = e => {
    const file = e.target.files?.[0]
    if (!file) return
    run(async () => {
      await api.importPackDraft(await file.text())
      await refresh()
      if (fileInput.current) fileInput.current.value = ''
    })
  }

  if (editingId) {
    return (
      <PackEditor
        packId={editingId}
        onBack={() => { setEditingId(null); refresh() }}
        onExit={onExit}
      />
    )
  }

  const userPacks = packs.filter(p => p.origin === 'user')
  const bundled = packs.filter(p => p.origin === 'bundled')

  return (
    <div className='game-selector library builder-landing'>
      <h1>Pack builder</h1>

      <form onSubmit={handleCreate}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder='name this pack…'
          autoFocus
        />
        <button className='btn primary' type='submit' disabled={busy}>
          {busy ? '…' : 'New blank pack'}
        </button>
      </form>

      {error && <div className='error'>{error}</div>}

      {userPacks.length > 0 && (
        <ul className='game-list pack-list'>
          {userPacks.map(pack => (
            <li key={pack.id}>
              <button className='game-row' onClick={() => handleOpen(pack.id)} disabled={busy}>
                <span className='game-name'>{pack.name}</span>
                <span className='game-meta'>
                  {pack.ok ? 'valid' : `${pack.errors.length} error${pack.errors.length === 1 ? '' : 's'}`}
                  {' · '}v{pack.version}
                </span>
              </button>
              <button
                className='btn ghost'
                data-tip='export as .json'
                onClick={() => handleExport(pack.id, pack.name)}
                disabled={busy}
              >⇩</button>
              <button
                className='btn ghost'
                data-tip='delete'
                onClick={() => handleDelete(pack.id, pack.name)}
                disabled={busy}
              >×</button>
            </li>
          ))}
        </ul>
      )}

      {bundled.length > 0 && (
        <>
          <div className='hint'>built-in packs · duplicate to edit</div>
          <ul className='game-list pack-list'>
            {bundled.map(pack => (
              <li key={pack.id}>
                <span className='game-row' style={{ cursor: 'default' }}>
                  <span className='game-name'>{pack.name}</span>
                  <span className='game-meta'>built-in · v{pack.version}</span>
                </span>
                <button
                  className='btn ghost'
                  data-tip='export as .json'
                  onClick={() => handleExport(pack.id, pack.name)}
                  disabled={busy}
                >⇩</button>
                <button
                  className='btn ghost'
                  data-tip='duplicate to edit'
                  onClick={() => handleDuplicate(pack.id)}
                  disabled={busy}
                >⎘</button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className='library-footer'>
        <button className='btn ghost' onClick={() => fileInput.current?.click()} disabled={busy}>
          Import pack…
        </button>
        <input
          ref={fileInput}
          type='file'
          accept='application/json,.json'
          onChange={handleImport}
          style={{ display: 'none' }}
        />
        <button className='btn ghost' onClick={onExit} disabled={busy}>Back to library</button>
        <span className='hint'>drafts live in this browser · export to move between devices</span>
      </div>
    </div>
  )
}

