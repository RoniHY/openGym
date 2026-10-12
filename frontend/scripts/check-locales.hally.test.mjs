/* check-locales.mjs and the Hally packs (src/locales/hally/), run the way CI runs it.
 *
 * Same fixture as check-locales.test.mjs: the real script copied into a throwaway tree, with
 * two upstream packs and a Hally folder beside them. */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'check-locales.mjs')

const upstream = { de: { Save: 'Speichern' }, es: { Save: 'Guardar' } }

const run = hally => {
  const dir = mkdtempSync(join(tmpdir(), 'check-locales-hally-'))
  try {
    mkdirSync(join(dir, 'scripts'))
    mkdirSync(join(dir, 'src', 'locales', 'hally'), { recursive: true })
    copyFileSync(script, join(dir, 'scripts', 'check-locales.mjs'))
    const write = (file, dict) => writeFileSync(file, `export default ${JSON.stringify(dict, null, 2)}\n`)
    for (const [lang, dict] of Object.entries(upstream)) write(join(dir, 'src', 'locales', `${lang}.js`), dict)
    for (const [lang, dict] of Object.entries(hally)) write(join(dir, 'src', 'locales', 'hally', `${lang}.js`), dict)
    const r = spawnSync(process.execPath, [join(dir, 'scripts', 'check-locales.mjs')], { encoding: 'utf8' })
    return { code: r.status, out: r.stdout + r.stderr }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

describe('check-locales.mjs, Hally packs', () => {
  it('passes a Hally string that only Spanish translates', () => {
    const r = run({ es: { 'My clients': 'Mis clientes', 'Pain {0}/10': 'Dolor {0}/10' } })
    expect(r.out).toContain('in sync')
    expect(r.out).toContain('Hally: 2 keys in es')
    expect(r.code).toBe(0)
  })

  it('still fails an upstream key that only one upstream pack has', () => {
    upstream.es['Only here'] = 'Solo aquí'
    try {
      const r = run({ es: { 'My clients': 'Mis clientes' } })
      expect(r.code).toBe(1)
      expect(r.out).toContain('only here')
    } finally { delete upstream.es['Only here'] }
  })

  it('fails a Hally string that reuses an upstream key', () => {
    const r = run({ es: { Save: 'Guardar ya' } })
    expect(r.code).toBe(1)
    expect(r.out).toContain('upstream key')
  })

  it('fails a blank Hally string and one that lost its placeholder', () => {
    const r = run({ es: { 'My clients': ' ', 'Pain {0}/10': 'Dolor' } })
    expect(r.code).toBe(1)
    expect(r.out).toContain('blank')
    expect(r.out).toContain('placeholders')
  })

  it('fails a Hally string another language has and Spanish does not', () => {
    const r = run({ es: { 'My clients': 'Mis clientes' }, fr: { 'My clients': 'Mes clients', 'Pain': 'Douleur' } })
    expect(r.code).toBe(1)
    expect(r.out).toContain('missing')
  })

  it('fails a Hally folder without a Spanish pack', () => {
    const r = run({ fr: { 'My clients': 'Mes clients' } })
    expect(r.code).toBe(1)
    expect(r.out).toContain('no es.js')
  })
})
