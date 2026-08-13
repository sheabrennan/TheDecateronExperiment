import { FieldError } from './shared.jsx'

function fieldErrors (validation, path) {
  if (!validation) return []
  return [...validation.errors, ...validation.warnings].filter(e => e.path === path)
}

export default function TemplateVarsPanel ({ draft, onPatch, validation }) {
  const templateVars = draft.templateVars ?? []
  const setVars = next => onPatch(d => ({ ...d, templateVars: next }))

  return (
    <div className='builder-room-detail'>
      <div className='builder-explainer'>
        <p>
          Any room's <strong>read-aloud</strong>, <strong>detail</strong>, <strong>GM</strong>,{' '}
          <strong>orientation</strong>, or <strong>on-key</strong> text can include a{' '}
          <code>{'{{token}}'}</code>, and it gets swapped out for a real value when the room
          is actually shown at the table — the pack file keeps saying{' '}
          <code>{'{{token}}'}</code>, but a GM playing the game never sees the braces.
        </p>
        <p>
          <code>{'{{cellColor}}'}</code> is always available, for free — write "the walls
          glow <code>{'{{cellColor}}'}</code>" once, and it reads as "the walls glow
          Verdant" in one tesseract and "the walls glow Crimson" in the room's other one,
          with no need to write the room twice.
        </p>
        <p>
          Below, you can declare your own tokens the same way — say your dungeon has a
          recurring villain and you don't want to retype (or re-decide) their name in
          every room. Declare <code>{'{{bigBadName}}'}</code> once here, use it in as many
          rooms as you like, and change it in one place later if you change your mind.
        </p>
        <p className='hint'>
          This is a different mechanism from a room's <strong>variant</strong> text
          (<code>{'{{variant}}'}</code>) and from <strong>filler templates</strong> on the
          left — those pick between several pre-written pieces of prose per room instance;
          this one is a plain find-and-replace applied to whatever text is already there.
        </p>
      </div>

      <div className='builder-field-row column'>
        <label data-tip="A token available in every room's text, filled in with what the GM sees at the table.">
          Custom template variables
        </label>
        <ul className='builder-sub-list'>
          {templateVars.map((v, i) => (
            <li key={i} className='builder-list-row'>
              <input
                value={v.key ?? ''}
                onChange={e => setVars(templateVars.map((x, j) => j === i ? { ...x, key: sanitizeKeyChars(e.target.value) } : x))}
                placeholder='key'
                className='builder-narrow'
                data-tip='written in text as {{key}} — letters, digits and underscores only'
              />
              <input
                value={v.value ?? ''}
                onChange={e => setVars(templateVars.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                placeholder='value shown at the table'
              />
              <button type='button' className='btn ghost' onClick={() => setVars(templateVars.filter((_, j) => j !== i))}>×</button>
            </li>
          ))}
        </ul>
        <button
          type='button' className='btn ghost'
          onClick={() => setVars([...templateVars, { key: '', value: '' }])}
        >+ add template variable</button>
        <FieldError errors={fieldErrors(validation, 'templateVars')} />
      </div>
    </div>
  )
}

// A template key isn't a slug (it's a JS-identifier-ish token, underscores and
// case allowed), so this only strips characters that would break {{key}}
// parsing -- rather than reusing schema.js's room-slug slugify. Deliberately
// does not enforce "must start with a letter" here: doing that inline, on
// every keystroke, means backspacing toward an empty field keeps snapping
// back to the old value instead of actually clearing. Leave a
// not-yet-valid-leading-character key on screen and let the validator's
// PACK_TEMPLATE_VAR_KEY_INVALID message say so.
function sanitizeKeyChars (text) {
  return String(text).replace(/[^a-zA-Z0-9_]/g, '')
}
