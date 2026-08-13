// Validates a pack and prints its findings.
//
//   node scripts/validate-pack.js [path ...]
//
// Exits non-zero if any pack has errors, so it drops straight into a build or
// a pre-publish check.  Warnings never fail the run.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { validatePack } from '../src/pack/validate.js'

const paths = process.argv.slice(2)
if (!paths.length) paths.push('packs/decateron/pack.json')

let failed = false

for (const path of paths) {
  const full = resolve(path)
  console.log(`\n${full}`)

  let json
  try {
    json = JSON.parse(readFileSync(full, 'utf8'))
  } catch (err) {
    console.log(`  error   PACK_UNREADABLE\n          ${err.message}`)
    failed = true
    continue
  }

  const { ok, errors, warnings, info } = validatePack(json)

  for (const e of errors) {
    console.log(`  error   ${e.code}  (${e.path || '-'})\n          ${e.message}`)
  }
  for (const w of warnings) {
    console.log(`  warn    ${w.code}  (${w.path || '-'})\n          ${w.message}`)
  }

  if (info.authoredRooms !== undefined) {
    const parts = [
      `${info.authoredRooms} authored`,
      `${info.fillerNeeded} filled`,
      `${info.distinctContent ?? '?'} distinct`,
      `${info.cellsWithKeys ?? '?'}/${info.cellCount} cells keyed`
    ]
    console.log(`  ${parts.join('  ·  ')}`)
  }

  console.log(`  ${ok ? 'OK' : 'FAILED'}  ${errors.length} error(s), ${warnings.length} warning(s)`)
  if (!ok) failed = true
}

console.log('')
process.exit(failed ? 1 : 0)
