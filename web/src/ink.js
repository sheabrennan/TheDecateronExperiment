// Making arbitrary pack colours legible.
//
// A pack ships its own ten-colour palette, and those colours are the players'
// only tell for which tesseract they are in -- so the app has to show them. But
// a palette is chosen for identity, not for contrast: the reference pack
// includes #FFFFFF and #FFFF00, which are invisible painted onto a light
// background, and #0000FF, which is barely readable on a dark one.
//
// So the raw hex is only ever used for *swatches* -- a filled block, which
// works at any lightness as long as it has a border. Anything rendered as text
// or as a thin line goes through `ink()`, which keeps the hue and saturation
// and moves only the lightness until it clears a contrast ratio against the
// current background. Identity survives; legibility is guaranteed.
//
// Adjusting lightness alone is what keeps Crimson recognisably crimson. A
// generic "darken by 40%" would not: it fails for colours that are already
// dark, and overshoots for pale ones.

const CONTRAST_TEXT = 4.6 // WCAG AA for body text, with a little headroom.
const CONTRAST_LINE = 3.1 // AA for large text and UI edges.

// ── Conversions ─────────────────────────────────────────────────────────────

function parse (hex) {
  const clean = String(hex ?? '').replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  if (!/^[0-9a-f]{6}$/i.test(full)) return null

  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
}

function toHex ([r, g, b]) {
  return '#' + [r, g, b]
    .map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('')
}

function rgbToHsl ([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R
    ? ((G - B) / d + (G < B ? 6 : 0))
    : max === G
      ? (B - R) / d + 2
      : (R - G) / d + 4

  return [h / 6, s, l]
}

function hslToRgb ([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255]

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = t => {
    let v = t
    if (v < 0) v += 1
    if (v > 1) v -= 1
    if (v < 1 / 6) return p + (q - p) * 6 * v
    if (v < 1 / 2) return q
    if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6
    return p
  }

  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255]
}

// ── Contrast ────────────────────────────────────────────────────────────────

function luminance ([r, g, b]) {
  const [R, G, B] = [r, g, b].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

export function contrast (a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

// ── Derivation ──────────────────────────────────────────────────────────────

let background = [7, 7, 16]
const cache = new Map()

export function setInkBackground (hex) {
  const rgb = parse(hex)
  if (!rgb) return
  background = rgb
  cache.clear()
}

// Walks lightness toward whichever end of the scale gains contrast against the
// current background, stopping as soon as the target is met so the colour moves
// no further than it has to.
function derive (rgb, target) {
  if (contrast(rgb, background) >= target) return rgb

  const [h, s, l] = rgbToHsl(rgb)
  const darkBackground = luminance(background) < 0.5

  let best = rgb
  let bestContrast = contrast(rgb, background)

  // 40 steps across the full range is finer than the eye resolves, and the
  // search is over a monotonic-enough function that stepping beats bisection
  // for how few operations it costs.
  for (let i = 1; i <= 40; i++) {
    const step = i / 40
    const candidate = hslToRgb([h, s, darkBackground ? l + (1 - l) * step : l * (1 - step)])
    const ratio = contrast(candidate, background)

    if (ratio > bestContrast) {
      best = candidate
      bestContrast = ratio
    }
    if (ratio >= target) return candidate
  }

  return best
}

function resolve (hex, target, key) {
  const cacheKey = `${key}:${hex}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const rgb = parse(hex)
  const result = rgb ? toHex(derive(rgb, target)) : (hex ?? 'currentColor')

  cache.set(cacheKey, result)
  return result
}

// A pack colour, made readable as text against the current theme.
export function ink (hex) {
  return resolve(hex, CONTRAST_TEXT, 'text')
}

// Same, at the looser ratio that suits borders, rules and large glyphs.
export function line (hex) {
  return resolve(hex, CONTRAST_LINE, 'line')
}
