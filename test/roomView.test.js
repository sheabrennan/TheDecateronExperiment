import test from 'node:test'
import assert from 'node:assert/strict'

import { roomView } from '../src/engine/roomView.js'

const baseRoom = () => ({
  name: 'Vault',
  read: 'The walls glow {{cellColor}}.',
  detail: 'A plaque names {{guardian}}.',
  gm: 'The guardian is {{guardian}}, hostile.',
  orientation: 'Down is toward {{cellColor}}.',
  onKey: { read: '{{guardian}} nods.', detail: '', gm: '' }
})

test('{{cellColor}} substitutes from the viewed cell', () => {
  const view = roomView(baseRoom(), { cell: { colorName: 'Verdant', color: '#00ff00' } })
  assert.equal(view.read, 'The walls glow Verdant.')
  assert.equal(view.orientation, 'Down is toward Verdant.')
})

test('cellColor falls back to the raw hex when no colorName is set', () => {
  const view = roomView(baseRoom(), { cell: { color: '#00ff00' } })
  assert.equal(view.read, 'The walls glow #00ff00.')
})

test('pack-defined template vars substitute alongside cellColor', () => {
  const view = roomView(baseRoom(), {
    cell: { colorName: 'Verdant' },
    templateVars: [{ key: 'guardian', value: 'Azreth' }]
  })
  assert.equal(view.detail, 'A plaque names Azreth.')
  assert.equal(view.gm, 'The guardian is Azreth, hostile.')
})

test('template vars are applied before onKey content is merged in', () => {
  const view = roomView(baseRoom(), {
    keyHeld: true,
    cell: { colorName: 'Verdant' },
    templateVars: [{ key: 'guardian', value: 'Azreth' }]
  })
  assert.equal(view.read, 'Azreth nods.')
})

test('an unknown token is left as-is rather than dropped', () => {
  const view = roomView(baseRoom(), { cell: { colorName: 'Verdant' } })
  assert.equal(view.detail, 'A plaque names {{guardian}}.')
})

test('no cell and no templateVars leaves text untouched', () => {
  const view = roomView(baseRoom())
  assert.equal(view.read, 'The walls glow {{cellColor}}.')
})

test('the built-in cellColor always wins over a same-named custom var', () => {
  const view = roomView(baseRoom(), {
    cell: { colorName: 'Verdant' },
    templateVars: [{ key: 'cellColor', value: 'stale' }]
  })
  assert.equal(view.read, 'The walls glow Verdant.')
})
