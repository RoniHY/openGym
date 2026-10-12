import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import es from '../locales/es.js'
import hallyEs from '../locales/hally/es.js'
import { withHally, hallyKeys } from './hally-i18n.js'

const src = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('withHally', () => {
  it('puts the Hally strings over the Spanish pack', () => {
    const merged = withHally('es', { Save: 'Guardar' })
    expect(merged.Save).toBe('Guardar')
    for (const k of hallyKeys('es')) expect(merged[k]).toBe(hallyEs[k])
  })

  it('leaves a language without a Hally pack as it is, so its Hally strings read in English', () => {
    const de = { Save: 'Speichern' }
    expect(withHally('de', de)).toBe(de)
    expect(hallyKeys('de')).toEqual([])
  })
})

describe('the Spanish packs', () => {
  it('no Hally key reuses an upstream key', () => {
    expect(Object.keys(hallyEs).filter(k => k in es)).toEqual([])
  })

  // "Entrenador" is the human trainer in Hally. Upstream calls its AI Coach "Entrenador" in
  // Spanish; the fork renamed every one of those to "Coach IA". A release that brings a new
  // Coach string brings the old word with it, and this is what says so after the merge.
  it('keeps the word "entrenador" for the human trainer, never for the AI Coach', () => {
    const upstream = Object.entries(es).filter(([, v]) => /entrenador/i.test(typeof v === 'string' ? v : JSON.stringify(v))).map(([k]) => k)
    expect(upstream).toEqual(['suspension trainer'])
  })

  it('writes Mexican Spanish in the Hally strings (tú and ustedes, never vosotros)', () => {
    const peninsular = /\b(vosotros|vuestr[oa]s?|túmbate|tumbad[oa]?|pulsa|pulsad|habéis|podéis|tenéis|queréis|estáis|sois|ordenador|móvil)\b/i
    expect(Object.entries(hallyEs).filter(([, v]) => peninsular.test(v))).toEqual([])
  })
})

// The same literal-call reading as scripts/check-source-strings.mjs, over Hally's own files: a
// string that reaches the screen in English on a Spanish instance is the bug this catches.
describe('Hally source strings', () => {
  const CALL = /(^|[^A-Za-z0-9_$.])t\(\s*(['"])((?:\\.|(?!\2)[^\\])*)\2/g
  const PLURAL = /(^|[^A-Za-z0-9_$.])tn\(\s*'((?:\\.|[^'\\])*)'\s*,\s*(')((?:\\.|[^'\\])*)'/g
  const files = []
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) { if (name !== 'locales' && name !== 'instr') walk(p) }
      else if (/(^|[\\/])(hally-[^\\/]*|Hally[^\\/]*|Trainer[^\\/]*)\.(js|jsx)$/.test(p) && !/\.test\.(js|jsx)$/.test(name)) files.push(p)
    }
  }
  walk(src)

  it('are all translated to Spanish', () => {
    const missing = []
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(CALL)) {
        const key = m[3].replace(/\\(['"\\])/g, '$1')
        if (key && !(key in hallyEs) && !(key in es)) missing.push(key)
      }
      // tn('{0} note', '{0} notes', n): a pack without plural forms answers through t() with
      // whichever of the two fits, so both have to be there.
      for (const m of readFileSync(file, 'utf8').matchAll(PLURAL)) {
        for (const key of [m[2], m[4]]) if (!(key in hallyEs) && !(key in es)) missing.push(key)
      }
    }
    expect([...new Set(missing)]).toEqual([])
  })
})
