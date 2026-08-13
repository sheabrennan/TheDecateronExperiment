import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api.js'

// The library the old build did not have.  Previously the only way in was to
// retype a game's exact name -- there was no list, no way to leave a loaded
// game without reloading the page, and a typo silently generated a whole new
// dungeon instead of resuming.

const when = iso => {
  if (!iso) return ''
  const date = new Date(iso)
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return date.toLocaleDateString()
}

export default function GameLibrary ({ onOpen, onBuildPack }) {
  const [games, setGames] = useState([])
  const [packs, setPacks] = useState([])
  const [name, setName] = useState('')
  const [packId, setPackId] = useState(null)
  const [mode, setMode] = useState('gm')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const fileInput = useRef(null)

  const refresh = useCallback(async () => {
    setGames(await api.listGames())
  }, [])

  useEffect(() => {
    api.listPacks().then(available => {
      setPacks(available)
      setPackId(available[0]?.id ?? null)
    }).catch(err => setError(err.message))
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
    run(async () => onOpen(await api.createGame({ name, packId, cellChoiceMode: mode })))
  }

  const handleOpen = gameId => run(async () => onOpen(await api.openGame(gameId)))

  const handleDelete = (gameId, gameName) => {
    if (!window.confirm(`Delete "${gameName}"? This cannot be undone.`)) return
    run(async () => setGames(await api.deleteGame(gameId)))
  }

  const handleImport = e => {
    const file = e.target.files?.[0]
    if (!file) return
    run(async () => {
      await api.importGame(await file.text())
      await refresh()
      if (fileInput.current) fileInput.current.value = ''
    })
  }

  const selected = packs.find(p => p.id === packId)

  return (
    <div className='game-selector library'>
      <h1>The Decateron Experiment</h1>

      <form onSubmit={handleCreate}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder='name this dungeon…'
          autoFocus
        />

        {packs.length > 1 && (
          <select value={packId ?? ''} onChange={e => setPackId(e.target.value)}>
            {packs.map(pack => (
              <option key={pack.id} value={pack.id} disabled={!pack.ok}>
                {pack.name} {pack.ok ? '' : '(unplayable)'}
              </option>
            ))}
          </select>
        )}

        <select value={mode} onChange={e => setMode(e.target.value)} title='who picks the tesseract a door opens into'>
          <option value='gm'>GM picks the tesseract</option>
          <option value='random'>Chance picks the tesseract</option>
        </select>

        <button className='btn primary' type='submit' disabled={busy}>
          {busy ? '…' : 'Generate'}
        </button>
      </form>

      {selected && (
        <div className='hint'>
          {selected.description}
          {selected.info?.authoredRooms != null && (
            <> · {selected.info.authoredRooms} authored
              {selected.info.fillerNeeded > 0 && <> + {selected.info.fillerNeeded} filled</>}
              {selected.info.cellsWithKeys != null && <> · {selected.info.cellsWithKeys}/10 keyed</>}
            </>
          )}
        </div>
      )}

      {error && <div className='error'>{error}</div>}

      {games.length > 0 && (
        <ul className='game-list'>
          {games.map(game => (
            <li key={game.gameId}>
              <button className='game-row' onClick={() => handleOpen(game.gameId)} disabled={busy}>
                <span className='game-name'>{game.name}</span>
                <span className='game-meta'>
                  {game.roomName ? `${game.roomName} · ` : ''}
                  {game.moves} move{game.moves === 1 ? '' : 's'} · {when(game.lastModified)}
                </span>
              </button>
              <button
                className='btn ghost'
                title='delete'
                onClick={() => handleDelete(game.gameId, game.name)}
                disabled={busy}
              >×</button>
            </li>
          ))}
        </ul>
      )}

      <div className='library-footer'>
        <button className='btn ghost' onClick={() => fileInput.current?.click()} disabled={busy}>
          Import save…
        </button>
        <input
          ref={fileInput}
          type='file'
          accept='application/json,.json'
          onChange={handleImport}
          style={{ display: 'none' }}
        />
        {onBuildPack && (
          <button className='btn ghost' onClick={onBuildPack} disabled={busy}>
            Build a pack…
          </button>
        )}
        <span className='hint'>saves live in this browser · export to move between devices</span>
      </div>
    </div>
  )
}
