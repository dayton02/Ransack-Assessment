import { config } from './config.js'

const SESSION_STORAGE_KEY = 'play_and_win_session_v1'
const DEVICE_STORAGE_KEY = 'play_and_win_device_id_v1'
const DEVICE_COOKIE_NAME = 'paw_device_id'
const ADMIN_PIN_KEY = 'play_and_win_admin_pin'

function readCookie(name) {
  if (typeof document === 'undefined') return ''
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : ''
}

function writeCookie(name, value) {
  if (typeof document === 'undefined') return
  try {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=2592000; path=/; SameSite=Lax`
  } catch {
    // Ignore cookie errors in restricted contexts
  }
}

/**
 * Persistent device identifier mirrored across both localStorage and a cookie
 * so refreshing or closing the browser cannot reset a claimed phone.
 */
export function getDeviceId() {
  let id = ''
  try {
    id = localStorage.getItem(DEVICE_STORAGE_KEY) || ''
  } catch {
    id = ''
  }
  if (!id) {
    id = readCookie(DEVICE_COOKIE_NAME)
  }
  if (!id) {
    id = generateUUID()
  }
  try {
    localStorage.setItem(DEVICE_STORAGE_KEY, id)
  } catch {
    // Ignore
  }
  writeCookie(DEVICE_COOKIE_NAME, id)
  return id
}

/**
 * Generates a RFC 4122 v4 UUID safely even over non-HTTPS LAN IPs
 * (e.g. http://192.168.1.x:5173 on mobile phones where crypto.randomUUID is unavailable).
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Ignore storage errors
  }
  return session
}

export function startNewSession(options = {}) {
  const session = {
    sessionId: generateUUID(),
    createdAt: new Date().toISOString(),
    funMode: Boolean(options.funMode),
    lastResult: null,
    claimCode: null,
    claimed: false,
    claimedAt: null,
    finalViewLogged: false,
  }
  return saveSession(session)
}

/**
 * Reuses the active unclaimed session if it matches `funMode` (prevents Start -> Back -> Start
 * from minting duplicate sessions). Starts a new session only on first play, after a claim,
 * or when switching between Prize Play and Play-for-Fun.
 */
export function getOrStartSession(options = {}) {
  const wantFun = Boolean(options.funMode)
  const existing = getSession()
  if (
    existing &&
    existing.sessionId &&
    !existing.claimed &&
    Boolean(existing.funMode) === wantFun
  ) {
    return { session: existing, isNew: false }
  }
  return { session: startNewSession({ funMode: wantFun }), isNew: true }
}

export function ensureActiveSession() {
  const existing = getSession()
  if (existing && existing.sessionId && !existing.claimed) {
    return existing
  }
  return startNewSession()
}

export function updateSession(patch) {
  const current = getSession() || startNewSession()
  const updated = { ...current, ...patch }
  return saveSession(updated)
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // Ignore
  }
}

export function getSavedAdminPin() {
  try {
    return sessionStorage.getItem(ADMIN_PIN_KEY) || ''
  } catch {
    return ''
  }
}

export function setSavedAdminPin(pin) {
  try {
    if (pin) sessionStorage.setItem(ADMIN_PIN_KEY, pin)
    else sessionStorage.removeItem(ADMIN_PIN_KEY)
  } catch {
    // Ignore
  }
}

/**
 * Compute score metrics dynamically from `config.rules.passMark`.
 */
export function evaluateScore(score, maxScore) {
  const safeMax = Math.max(1, Number(maxScore) || 1)
  const safeScore = Math.max(0, Number(score) || 0)
  const passMark = Number(config.rules.passMark) || 0.8
  const ratio = safeScore / safeMax
  const needed = Math.ceil(safeMax * passMark)
  const percent = Math.round(ratio * 100)
  const passPercent = Math.round(passMark * 100)
  const won = ratio + 1e-9 >= passMark
  return {
    score: safeScore,
    maxScore: safeMax,
    needed,
    percent,
    passPercent,
    won,
  }
}

const LAST_QUIZ_IDS_KEY = 'play_and_win_last_quiz_ids'

function shuffleArray(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function getLastQuizQuestionIds() {
  try {
    const raw = sessionStorage.getItem(LAST_QUIZ_IDS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? new Set(parsed) : new Set()
  } catch {
    return new Set()
  }
}

function saveLastQuizQuestionIds(ids) {
  try {
    sessionStorage.setItem(LAST_QUIZ_IDS_KEY, JSON.stringify(ids))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Compute active quiz questions based on `config.quiz`.
 * - Shuffles the full question bank when `shuffleQuestions` is true.
 * - If the bank is larger than `questionLimit`, prioritises unseen questions from
 *   the bank before repeating ones from the previous round for high replayability.
 * - Attaches a per-question `optionOrder` permutation when `shuffleOptions` is true
 *   so answer options are randomised while staying aligned across language switches.
 */
export function getActiveQuizQuestions() {
  const all = Array.isArray(config.quiz.questions)
    ? config.quiz.questions.map((q, idx) => ({ ...q, _bankKey: q.id ?? idx }))
    : []

  const limit = Number(config.quiz.questionLimit)
  const effectiveCount =
    Number.isFinite(limit) && limit > 0 ? Math.min(limit, all.length) : all.length

  let selected
  if (config.quiz.shuffleQuestions) {
    if (effectiveCount < all.length) {
      // Larger question bank than round limit: prioritise unseen questions first
      const lastSeen = getLastQuizQuestionIds()
      const unseen = shuffleArray(all.filter((q) => !lastSeen.has(q._bankKey)))
      const seen = shuffleArray(all.filter((q) => lastSeen.has(q._bankKey)))
      selected = shuffleArray([...unseen, ...seen].slice(0, effectiveCount))
    } else {
      selected = shuffleArray(all)
    }
  } else {
    selected = all.slice(0, effectiveCount)
  }

  saveLastQuizQuestionIds(selected.map((q) => q._bankKey))

  return selected.map((q) => {
    const indices = Array.from({ length: (q.options || []).length }, (_, i) => i)
    const optionOrder = config.quiz.shuffleOptions ? shuffleArray(indices) : indices
    return {
      ...q,
      optionOrder,
    }
  })
}

export function getQuizMaxScore() {
  const totalQuestions = config.quiz.questionLimit
    ? Math.min(Number(config.quiz.questionLimit), config.quiz.questions.length)
    : config.quiz.questions.length
  return Math.max(1, totalQuestions) * (Number(config.quiz.pointsPerCorrect) || 1)
}

export function getActiveMemorySymbols() {
  const all = Array.isArray(config.memory.symbols) ? config.memory.symbols : []
  const count = Math.max(2, Math.min(Number(config.memory.pairCount) || 6, all.length))
  return all.slice(0, count)
}

export function getMemoryMaxScore() {
  const pairs = getActiveMemorySymbols().length
  return pairs * (Number(config.memory.pointsPerPair) || 100)
}

/**
 * Hash routing helpers (`#/`, `#/select`, `#/play/quiz`, `#/play/memory`, `#/result`, `#/win`, `#/admin`)
 */
export function getRoute() {
  const hash = window.location.hash || '#/'
  const clean = hash.replace(/^#/, '').split('?')[0] || '/'
  return clean.startsWith('/') ? clean : `/${clean}`
}

export function navigate(route) {
  const target = route.startsWith('#') ? route : `#${route}`
  if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = target
  }
}
