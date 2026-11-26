import { config } from './config.js'

const LANG_STORAGE_KEY = 'play_and_win_lang'
const LARGE_TEXT_STORAGE_KEY = 'play_and_win_large_text'

let currentLang = loadInitialLanguage()
let largeTextEnabled = loadInitialLargeText()
const listeners = new Set()

function loadInitialLargeText() {
  try {
    return localStorage.getItem(LARGE_TEXT_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function isLargeText() {
  return largeTextEnabled
}

export function applyLargeText() {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('is-large-text', largeTextEnabled)
}

export function toggleLargeText() {
  largeTextEnabled = !largeTextEnabled
  try {
    localStorage.setItem(LARGE_TEXT_STORAGE_KEY, largeTextEnabled ? '1' : '0')
  } catch {
    // Ignore storage errors
  }
  applyLargeText()
  return largeTextEnabled
}

function loadInitialLanguage() {
  try {
    const saved = sessionStorage.getItem(LANG_STORAGE_KEY)
    if (saved && isSupportedLang(saved)) {
      return saved
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
  return config.languages.defaultLanguage || 'en'
}

export function isSupportedLang(code) {
  return config.languages.supported.some((lang) => lang.code === code)
}

export function getLang() {
  return currentLang
}

export function getLangMeta(code = currentLang) {
  return (
    config.languages.supported.find((lang) => lang.code === code) ||
    config.languages.supported[0]
  )
}

export function setLang(code) {
  if (!isSupportedLang(code) || code === currentLang) return
  currentLang = code
  try {
    sessionStorage.setItem(LANG_STORAGE_KEY, code)
  } catch {
    // Ignore storage errors
  }
  applyDocumentLang()
  for (const fn of listeners) {
    fn(code)
  }
}

export function onLangChange(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function applyDocumentLang() {
  if (typeof document === 'undefined') return
  const meta = getLangMeta(currentLang)
  document.documentElement.lang = meta.htmlLang || meta.code
}

/**
 * Translate a UI copy key with optional `{placeholder}` interpolation.
 * Automatically falls back to English if a key is missing in another language.
 */
export function t(key, vars = {}, lang = currentLang) {
  const defaultLang = config.languages.defaultLanguage || 'en'
  const dict = config.copy[lang] || config.copy[defaultLang] || {}
  const fallbackDict = config.copy[defaultLang] || {}
  let text = dict[key] ?? fallbackDict[key] ?? key

  for (const [k, v] of Object.entries(vars)) {
    text = text.replaceAll(`{${k}}`, String(v))
  }
  return text
}

/**
 * Resolve event branding fields (`clientName`, `eventName`, `appTitle`, `tagline`).
 * Falls back to top-level `config.event` so editing English there always works.
 */
export function getEventText(field, lang = currentLang) {
  const defaultLang = config.languages.defaultLanguage || 'en'
  if (lang === defaultLang) {
    return config.event[field] ?? ''
  }
  const translated = config.event.translations?.[lang]?.[field]
  return translated ?? config.event[field] ?? ''
}

/**
 * Resolve a quiz question's text & options for the active language.
 * Falls back cleanly to the plain starter format (`question`, `options`).
 * If `rawQuestion.optionOrder` is attached (from `shuffleOptions`), reorders
 * options and remaps `answerIndex` consistently across all languages.
 */
export function getLocalizedQuestion(rawQuestion, lang = currentLang) {
  const defaultLang = config.languages.defaultLanguage || 'en'
  const tr = lang !== defaultLang ? rawQuestion.translations?.[lang] : null
  const question = tr?.question || rawQuestion.question
  const baseOptions =
    Array.isArray(tr?.options) && tr.options.length === rawQuestion.options.length
      ? tr.options
      : rawQuestion.options

  const order =
    Array.isArray(rawQuestion.optionOrder) && rawQuestion.optionOrder.length === baseOptions.length
      ? rawQuestion.optionOrder
      : baseOptions.map((_, i) => i)

  const options = order.map((origIdx) => baseOptions[origIdx])
  const answerIndex = order.indexOf(rawQuestion.answerIndex)

  return {
    id: rawQuestion.id,
    question,
    options,
    answerIndex: answerIndex >= 0 ? answerIndex : rawQuestion.answerIndex,
  }
}

/**
 * Resolve a Memory Match card symbol label for the active language.
 */
export function getSymbolLabel(symbol, lang = currentLang) {
  const defaultLang = config.languages.defaultLanguage || 'en'
  if (symbol.labels) {
    return symbol.labels[lang] || symbol.labels[defaultLang] || symbol.id
  }
  return symbol.label || symbol.id
}

export function getGameName(gameId, lang = currentLang) {
  if (gameId === 'quiz') return t('quizTitle', {}, lang)
  if (gameId === 'memory') return t('memoryTitle', {}, lang)
  return gameId || ''
}

/**
 * Render the compact Singapore 4-language segmented tab bar + A+ Large Text toggle.
 */
export function renderLanguageBar(container) {
  const active = getLang()
  const large = isLargeText()
  container.innerHTML = `
    <div class="lang-bar" role="tablist" aria-label="Choose language">
      ${config.languages.supported
        .map(
          (lang) => `
        <button
          type="button"
          class="lang-tab ${lang.code === active ? 'is-active' : ''}"
          role="tab"
          aria-selected="${lang.code === active ? 'true' : 'false'}"
          data-lang="${lang.code}"
        >${lang.label}</button>
      `,
        )
        .join('')}
    </div>
    <button
      type="button"
      id="large-text-toggle"
      class="text-size-btn ${large ? 'is-active' : ''}"
      aria-pressed="${large ? 'true' : 'false'}"
      aria-label="Toggle large text"
      title="Text Size (Small / Large)"
    ><span class="aa-pair"><span class="aa-small">A</span><span class="aa-big">A</span></span></button>
  `

  container.querySelectorAll('.lang-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLang(btn.dataset.lang)
    })
  })

  const sizeBtn = container.querySelector('#large-text-toggle')
  sizeBtn?.addEventListener('click', () => {
    const enabled = toggleLargeText()
    sizeBtn.classList.toggle('is-active', enabled)
    sizeBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false')
  })
}
