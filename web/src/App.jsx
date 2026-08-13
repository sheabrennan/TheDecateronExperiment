import { useState, useCallback, useEffect } from 'react'
import { api } from './api.js'
import { ink, setInkBackground } from './ink.js'
import Breadcrumb from './components/Breadcrumb.jsx'
import RoomPanel from './components/RoomPanel.jsx'
import DoorsDrawer from './components/DoorsDrawer.jsx'
import GameLibrary from './components/GameLibrary.jsx'
import PackBuilder from './components/PackBuilder.jsx'
import CatalogPanel from './components/CatalogPanel.jsx'
import AppMenu from './components/AppMenu.jsx'
import PartyBar from './components/PartyBar.jsx'
import LogPanel from './components/LogPanel.jsx'

const PREFS_KEY = 'tde.prefs'
const DEFAULT_PREFS = { theme: 'dark' }

// Theme belongs to the GM, not to a dungeon, so it lives beside the app rather
// than inside a save.
function loadPrefs () {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export default function App () {
  const [screen, setScreen] = useState('library')
  const [gameName, setGameName] = useState(null)
  const [roomContext, setRoomContext] = useState(null)
  const [doors, setDoors] = useState(null)
  const [openDoor, setOpenDoor] = useState(null)
  const [previewContext, setPreviewContext] = useState(null)
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false })
  // Which group the GM is running. Everything on screen describes this one.
  const [parties, setParties] = useState([])
  const [activeParty, setActiveParty] = useState(null)

  const [doorsOpen, setDoorsOpen] = useState(true)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [prefs, setPrefs] = useState(loadPrefs)

  const [inkTick, setInkTick] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const cellColor = roomContext?.cell?.color ?? '#6666cc'
  const previewColor = previewContext?.cell?.color ?? cellColor

  // Theme first: `ink` derives against the live background, so the background
  // has to be current before any colour is resolved.
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    setInkBackground(
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    )
    setInkTick(t => t + 1)
  }, [prefs])

  useEffect(() => {
    const root = document.documentElement.style
    // Raw hex for swatches and fills; the derived one for anything that has to
    // be read. A pack may ship pure white, which cannot be text on light.
    root.setProperty('--cell-color', cellColor)
    root.setProperty('--cell-ink', ink(cellColor))
  }, [cellColor, inkTick])

  const setPref = useCallback((key, value) => setPrefs(p => ({ ...p, [key]: value })), [])

  // ── Plumbing ────────────────────────────────────────────────────────────

  const withLoading = useCallback(async fn => {
    setLoading(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshDoors = useCallback(async partyId => {
    try {
      setDoors(await api.getDoors(partyId ?? activeParty))
    } catch { /* non-fatal */ }
  }, [activeParty])

  const applyCommand = useCallback(result => {
    setRoomContext(result.roomContext)
    // A move leaves the room behind still previewed, carrying the orientation
    // the party had while standing in it.
    setPreviewContext(result.previewContext ?? null)
    setOpenDoor(null)
    setNav({ canGoBack: result.canGoBack, canGoForward: result.canGoForward })
    if (result.parties) setParties(result.parties)
    if (result.roomContext?.party) setActiveParty(result.roomContext.party.id)
  }, [])

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleLoad = useCallback(({ name, roomContext: ctx, parties: list }) => {
    setGameName(name)
    setRoomContext(ctx)
    setParties(list ?? [])
    setActiveParty(ctx?.party?.id ?? null)
    setDoorsOpen(true)
    setScreen('game')
    refreshDoors()
  }, [refreshDoors])

  const handleOpenDoor = useCallback((doorIndex, targetCell) => {
    withLoading(async () => {
      const { currentContext, previewContext: pc } = await api.openDoor(doorIndex, targetCell, activeParty)
      setRoomContext(currentContext)
      setPreviewContext(pc)
      setOpenDoor({ index: doorIndex, cellId: pc.cell.id })
    })
  }, [withLoading, activeParty])

  const runCommand = useCallback((command, options) => {
    withLoading(async () => {
      applyCommand(await api.command(command, { partyId: activeParty, ...options }))
      await refreshDoors()
    })
  }, [withLoading, applyCommand, refreshDoors, activeParty])

  const handleClose = useCallback(() => {
    withLoading(async () => {
      const result = await api.command('close', { partyId: activeParty })
      setRoomContext(result.roomContext)
      setPreviewContext(null)
      setOpenDoor(null)
      setDoorsOpen(true)
    })
  }, [withLoading, activeParty])

  const handleFlag = useCallback((flag, value) => {
    withLoading(async () => {
      applyCommand(await api.setRoomFlag(flag, value, { partyId: activeParty }))
    })
  }, [withLoading, applyCommand, activeParty])

  const handleAddNote = useCallback(text => {
    withLoading(async () => {
      applyCommand(await api.addNote(text, activeParty))
    })
  }, [withLoading, applyCommand, activeParty])

  // ── Parties ─────────────────────────────────────────────────────────────

  const switchParty = useCallback(partyId => {
    withLoading(async () => {
      applyCommand(await api.setActiveParty(partyId))
      setPreviewContext(null)
      await refreshDoors(partyId)
    })
  }, [withLoading, applyCommand, refreshDoors])

  const handleSplit = useCallback(partyId => {
    withLoading(async () => {
      // Focus follows the new group: the GM split them in order to run them.
      const result = await api.splitParty(partyId ?? activeParty)
      applyCommand(result)
      setPreviewContext(null)
      await refreshDoors(result.newPartyId)
    })
  }, [withLoading, applyCommand, refreshDoors, activeParty])

  const handleMerge = useCallback((fromId, intoId) => {
    withLoading(async () => {
      applyCommand(await api.mergeParty(fromId, intoId))
      setPreviewContext(null)
      await refreshDoors(intoId)
    })
  }, [withLoading, applyCommand, refreshDoors])

  const handleRenameParty = useCallback((partyId, name) => {
    withLoading(async () => applyCommand(await api.renameParty(partyId, name)))
  }, [withLoading, applyCommand])

  const handlePartyNotes = useCallback((partyId, notes) => {
    withLoading(async () => applyCommand(await api.setPartyNotes(partyId, notes)))
  }, [withLoading, applyCommand])

  const handleReset = useCallback(event => {
    withLoading(async () => {
      const result = await api.applyReset(event)
      applyCommand(result)
      setPreviewContext(null)
      await refreshDoors()
      // A count told the GM nothing about *what* came back, so anything that
      // actually restored something opens the log on the entry naming it.
      const n = result.reset?.undone?.length ?? 0
      if (n) setLogOpen(true)
      else setError(`${event}: nothing to restore`)
    })
  }, [withLoading, applyCommand, refreshDoors])

  const handleCellChoiceMode = useCallback(mode => {
    withLoading(async () => {
      await api.setCellChoiceMode(mode)
      setPreviewContext(null)
      setOpenDoor(null)
      await refreshDoors()
    })
  }, [withLoading, refreshDoors])

  const handleExport = useCallback(() => {
    withLoading(async () => {
      const game = api.currentGame()
      const blob = new Blob([api.exportGame()], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = `${(game?.name ?? 'dungeon').replace(/[^\w-]+/g, '-')}.json`
      link.click()
      URL.revokeObjectURL(url)
    })
  }, [withLoading])

  const handleLeave = useCallback(() => {
    api.closeGame()
    setGameName(null)
    setRoomContext(null)
    setDoors(null)
    setPreviewContext(null)
    setOpenDoor(null)
    setParties([])
    setActiveParty(null)
    setScreen('library')
  }, [])

  if (screen === 'builder') {
    return <PackBuilder onExit={() => setScreen('library')} />
  }

  if (screen !== 'game' || !gameName) {
    return <GameLibrary onOpen={handleLoad} onBuildPack={() => setScreen('builder')} />
  }

  const hasPreview = Boolean(previewContext)
  const doorIsOpen = roomContext?.orientation?.doors?.some(d => d.isOpen) ?? false

  return (
    <div className='app-shell'>
      <header className='app-bar'>
        <span className='app-title' style={{ color: ink(cellColor) }}>{gameName}</span>

        <div className='app-bar-actions'>
          {/* Held keys, always visible. They used to appear only on a party chip,
              which is hidden while there is one party -- so the single most
              tracked number in a key-gated game was on screen only after a
              split. */}
          {roomContext?.keys && (
            <span
              className='keys-held'
              title={roomContext.keys.held.length
                ? `carrying: ${roomContext.keys.held.map(k => k.cellName ?? k.cellId).join(', ')}`
                : 'no keys carried yet'}
            >
              <span className='keys-count'>
                ⚷ {roomContext.keys.held.length}/{roomContext.keys.total}
              </span>
              {roomContext.keys.held.map(key => (
                <span key={key.cellId} className='keys-pip' style={{ background: key.cellColor }} />
              ))}
            </span>
          )}
          {roomContext?.isExit && <span className='rp-chip exit'>⊕ at the exit</span>}
          <PartyBar
            parties={parties}
            cells={api.cells()}
            onSelect={switchParty}
            onSplit={handleSplit}
            onMerge={handleMerge}
            onRename={handleRenameParty}
            onNotes={handlePartyNotes}
            loading={loading}
          />
          <AppMenu
            game={api.currentGame()}
            theme={prefs.theme}
            onTheme={v => setPref('theme', v)}
            cellChoiceMode={doors?.mode}
            onCellChoiceMode={handleCellChoiceMode}
            onCatalog={() => setCatalogOpen(true)}
            onLog={() => setLogOpen(true)}
            onExport={handleExport}
            onLeave={handleLeave}
            onReset={handleReset}
            loading={loading}
          />
        </div>
      </header>

      <Breadcrumb
        moves={roomContext?.recentMoves ?? []}
        currentRoom={roomContext?.room}
        currentCell={roomContext?.cell}
        currentProgress={roomContext?.progress}
        onRewind={count => runCommand('rewind', { count })}
      />

      <div className={`rooms ${hasPreview ? 'has-preview' : ''}`}>
        <RoomPanel
          context={roomContext}
          variant='current'
          color={ink(cellColor)}
          rawColor={cellColor}
          onFlag={handleFlag}
          onAddNote={handleAddNote}
          loading={loading}
        />
        {hasPreview && (
          <RoomPanel
            context={previewContext}
            variant='preview'
            color={ink(previewColor)}
            rawColor={previewColor}
            loading={loading}
          />
        )}
      </div>

      <div className='action-row'>
        <button
          className='btn primary'
          onClick={() => runCommand('move')}
          disabled={loading || !doorIsOpen}
        >Move →</button>
        {/* Also dismisses the room behind. move() closes the door as it
            commits, so after a move nothing is open by the engine's reckoning
            while that panel is still up -- gating Close on doorIsOpen alone
            left it on screen with no way to shut it. Move stays gated, so
            walking back has to be chosen from the door list. */}
        <button
          className='btn'
          onClick={handleClose}
          disabled={loading || (!doorIsOpen && !hasPreview)}
          title={doorIsOpen ? 'close the open door' : 'stop showing the room behind'}
        >
          Close
        </button>

        <span className='action-sep' />

        {/* Both reversible now: stepping back stashes the trail instead of
            discarding it, so a misclick on the breadcrumb is recoverable. */}
        <button
          className='btn'
          onClick={() => runCommand('back')}
          disabled={loading || !nav.canGoBack}
          title='step back one room'
        >← Back</button>
        <button
          className='btn'
          onClick={() => runCommand('forward')}
          disabled={loading || !nav.canGoForward}
          title='redo a step you took back'
        >Forward →</button>

        {error && <span className='error-text'>{error}</span>}
      </div>

      <DoorsDrawer
        doors={doors}
        openDoor={openDoor}
        onSelectDoor={handleOpenDoor}
        open={doorsOpen}
        onToggle={setDoorsOpen}
        loading={loading}
      />

      <CatalogPanel open={catalogOpen} onClose={() => setCatalogOpen(false)} />
      <LogPanel open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  )
}
