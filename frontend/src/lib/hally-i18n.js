// Hally's own strings, on top of the upstream language packs.
//
// The fork keeps Spanish (the default) and English. English is the source string, as everywhere
// in this app, so it needs no pack; Spanish has src/locales/hally/es.js. Every other language
// falls back to English for a Hally string, which is what t() does with a key it does not find.
//
// Kept out of src/locales/*.js on purpose: upstream adds keys to those files with every release,
// and its check (scripts/check-locales.mjs) wants all 18 to carry the same keys. A separate pack
// means no merge conflict and no 18 translations per string. The check reads this folder too.
import es from '../locales/hally/es.js'

const PACKS = { es }

/** The upstream pack of `lang` with Hally's strings over it; untouched for a language without any. */
export const withHally = (lang, dict) => (PACKS[lang] ? { ...dict, ...PACKS[lang] } : dict)

export const hallyKeys = lang => Object.keys(PACKS[lang] || {})
