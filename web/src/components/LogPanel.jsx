import { useState, useEffect } from 'react'
import { api } from '../api.js'

// What happened, as distinct from where anyone went.
//
// The breadcrumb answers "where have we been". This answers "what did we do" --
// which is the question a reset raises and nothing could previously answer:
// "long-rest: 1 thing(s) came back" told a GM a count and nothing else.

const ICON = { reset: '↻', split: '⑃', merge: '⑂', key: '⚷' }

const when = iso => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function LogPanel ({ open, onClose }) {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    let live = true
    api.getEventLog(200)
      .then(list => { if (live) setEvents(list) })
      .catch(err => { if (live) setError(err.message) })
    return () => { live = false }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className='catalog-overlay' onClick={onClose}>
      <div className='catalog log-panel' onClick={e => e.stopPropagation()}>
        <div className='catalog-head'>
          <h2>Session log</h2>
          <button className='btn ghost' onClick={onClose}>close</button>
        </div>

        {error && <div className='error'>{error}</div>}

        {events?.length === 0 && (
          <p className='log-empty'>
            Nothing recorded yet. Splits, merges, keys taken and resets appear here.
          </p>
        )}

        <ol className='log-list'>
          {(events ?? []).map((event, i) => (
            <li key={i} className={`log-entry is-${event.type}`}>
              <span className='log-icon'>{ICON[event.type] ?? '•'}</span>
              <span className='log-body'>
                <span className='log-summary'>{event.summary}</span>

                {/* A reset says how many came back; this says which ones. */}
                {event.detail?.items?.length > 0 && (
                  <ul className='log-items'>
                    {event.detail.items.map((item, j) => (
                      <li key={j}>
                        {item.label}
                        <span className='log-where'>{item.room} · {item.cell}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </span>
              <span className='log-when'>{when(event.at)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
