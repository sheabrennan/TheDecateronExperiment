// Bringing an older save forward.
//
// There is nothing to bring forward yet -- this is the initial release, and the
// migration chain that existed during development was for versions that never
// shipped. Carrying it would have been maintenance for a past that never
// happened.
//
// The hook stays because the *shape* is what is expensive to retrofit: a save is
// somebody's campaign, and the first time one needs migrating is the worst time
// to discover there is nowhere to put the code. Adding v2 means appending one
// function to STEPS and bumping the constant; nothing else moves.

export const SAVE_SCHEMA_VERSION = 1

// version N -> N + 1
const STEPS = {}

export function upgradeSave (save) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) return save

  let current = save
  let version = current.schemaVersion ?? 1

  while (version < SAVE_SCHEMA_VERSION) {
    const step = STEPS[version]
    if (!step) break
    current = step(current)
    version = current.schemaVersion ?? version + 1
  }

  return current
}

export function needsSaveUpgrade (save) {
  return (save?.schemaVersion ?? 1) < SAVE_SCHEMA_VERSION
}
