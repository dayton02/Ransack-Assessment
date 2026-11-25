import { config } from '../config.js'
import { t, getSymbolLabel } from '../i18n.js'
import { UI_SVGS, getSymbolSvg } from '../icons.js'
import { launchConfetti } from '../confetti.js'
import {
  ensureActiveSession,
  updateSession,
  getDeviceId,
  evaluateScore,
  getActiveMemorySymbols,
  navigate,
} from '../state.js'
import { saveRecord } from '../api.js'

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function shuffle(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function getGridLayout(cardCount) {
  const cols = cardCount <= 4 ? 2 : cardCount <= 12 ? 3 : 4
  const rows = Math.ceil(cardCount / cols)
  return { colsClass: `cols-${cols}`, rows }
}

export function mountMemoryScreen(container) {
  const session = ensureActiveSession()
  const symbols = getActiveMemorySymbols()
  const totalPairs = symbols.length
  const pointsPerPair = Number(config.memory.pointsPerPair) || 100
  const maxScore = totalPairs * pointsPerPair
  const timeLimitSeconds = Math.min(59, Math.max(10, Number(config.memory.timeLimitSeconds) || 45))
  const mismatchDelayMs = Number(config.memory.mismatchDelayMs) || 750
  const { needed } = evaluateScore(0, maxScore)

  // Build deck: 2 cards per symbol, shuffled
  const deck = shuffle(
    symbols.flatMap((sym) => [
      { uid: `${sym.id}-a`, symbolId: sym.id, symbol: sym, flipped: false, matched: false },
      { uid: `${sym.id}-b`, symbolId: sym.id, symbol: sym, flipped: false, matched: false },
    ]),
  )

  let timeLeft = timeLimitSeconds
  let matchedPairs = 0
  let score = 0
  let openIndices = []
  let boardLocked = false
  let finished = false
  let endBannerType = null // 'master' | 'timeout' | null

  let timerId = null
  let mismatchTimeout = null
  let finishTimeout = null

  function clearTimers() {
    clearInterval(timerId)
    clearTimeout(mismatchTimeout)
    clearTimeout(finishTimeout)
    timerId = null
  }

  async function completeGame(clearedEarly) {
    if (finished) return
    finished = true
    boardLocked = true
    clearInterval(timerId)
    clearTimeout(mismatchTimeout)

    endBannerType = clearedEarly ? 'master' : 'timeout'
    updateBanner()

    if (clearedEarly) {
      launchConfetti(1800)
    }

    const summary = evaluateScore(score, maxScore)
    const resultRecord = {
      gameId: 'memory',
      clearedEarly,
      ...summary,
    }

    const res = await saveRecord({
      sessionId: session.sessionId,
      deviceId: getDeviceId(),
      funMode: Boolean(session.funMode),
      eventType: 'game_completed',
      gameId: 'memory',
      score: summary.score,
      maxScore: summary.maxScore,
      won: summary.won,
    })

    updateSession({
      lastResult: resultRecord,
      claimCode: res?.claimCode || null,
      claimed: Boolean(res?.claimed),
      claimedAt: res?.claimedAt || null,
      deviceLocked: Boolean(res?.deviceLocked),
      previousClaimCode: res?.previousClaimCode || null,
      previousClaimedAt: res?.previousClaimedAt || null,
      ipClaimCount: Number(res?.ipClaimCount || 0),
    })

    finishTimeout = setTimeout(() => {
      navigate(summary.won ? '/win' : '/result')
    }, clearedEarly ? 1350 : 900)
  }

  function updateHudValues() {
    const timerEl = container.querySelector('#mem-timer')
    const scoreEl = container.querySelector('#mem-score')
    const pairsEl = container.querySelector('#mem-pairs')
    if (timerEl) {
      timerEl.textContent = `${timeLeft}s`
      timerEl.classList.toggle('is-urgent', timeLeft <= 10 && !finished)
    }
    if (scoreEl) scoreEl.textContent = `${score}`
    if (pairsEl) pairsEl.textContent = `${matchedPairs}/${totalPairs}`
  }

  function updateBanner() {
    const slot = container.querySelector('#mem-banner-slot')
    if (!slot) return
    if (endBannerType === 'master') {
      slot.innerHTML = `<div class="memory-banner is-master" role="status">${escapeHtml(t('forestMasterBanner'))}</div>`
    } else if (endBannerType === 'timeout') {
      slot.innerHTML = `<div class="memory-banner" role="status">${escapeHtml(t('timesUpBanner'))}</div>`
    } else {
      slot.innerHTML = `<p class="memory-hint">${escapeHtml(t('memoryHint'))}</p>`
    }
  }

  function updateLocalizedLabelsInPlace() {
    const backBtn = container.querySelector('#mem-back-btn')
    const targetTag = container.querySelector('#mem-target-tag')
    const lblTime = container.querySelector('#mem-lbl-time')
    const lblPairs = container.querySelector('#mem-lbl-pairs')
    const lblScore = container.querySelector('#mem-lbl-score')

    if (backBtn) backBtn.textContent = `← ${t('backHome')}`
    if (targetTag) targetTag.textContent = t('targetLabel', { needed })
    if (lblTime) lblTime.textContent = t('timeLeft')
    if (lblPairs) lblPairs.textContent = t('pairsLabel')
    if (lblScore) lblScore.textContent = t('scoreLabel')

    container.querySelectorAll('.memory-card').forEach((cardEl) => {
      const idx = Number(cardEl.dataset.idx)
      const labelEl = cardEl.querySelector('.memory-card-label')
      if (labelEl && deck[idx]) {
        const label = getSymbolLabel(deck[idx].symbol)
        labelEl.textContent = label
        cardEl.setAttribute('aria-label', deck[idx].flipped || deck[idx].matched ? label : 'Hidden card')
      }
    })
    updateBanner()
  }

  function handleCardTap(index) {
    if (finished || boardLocked) return
    const card = deck[index]
    if (!card || card.flipped || card.matched) return

    card.flipped = true
    const cardEl = container.querySelector(`.memory-card[data-idx="${index}"]`)
    cardEl?.classList.add('is-flipped')
    cardEl?.setAttribute('aria-label', getSymbolLabel(card.symbol))

    openIndices.push(index)
    if (openIndices.length < 2) return

    const [firstIdx, secondIdx] = openIndices
    const first = deck[firstIdx]
    const second = deck[secondIdx]

    if (first.symbolId === second.symbolId) {
      first.matched = true
      second.matched = true
      matchedPairs += 1
      score += pointsPerPair
      openIndices = []

      const firstEl = container.querySelector(`.memory-card[data-idx="${firstIdx}"]`)
      const secondEl = container.querySelector(`.memory-card[data-idx="${secondIdx}"]`)
      firstEl?.classList.add('is-matched')
      secondEl?.classList.add('is-matched')
      firstEl?.setAttribute('disabled', 'true')
      secondEl?.setAttribute('disabled', 'true')

      updateHudValues()

      if (matchedPairs >= totalPairs) {
        completeGame(true)
      }
    } else {
      boardLocked = true
      mismatchTimeout = setTimeout(() => {
        first.flipped = false
        second.flipped = false
        const firstEl = container.querySelector(`.memory-card[data-idx="${firstIdx}"]`)
        const secondEl = container.querySelector(`.memory-card[data-idx="${secondIdx}"]`)
        firstEl?.classList.remove('is-flipped')
        secondEl?.classList.remove('is-flipped')
        firstEl?.setAttribute('aria-label', 'Hidden card')
        secondEl?.setAttribute('aria-label', 'Hidden card')
        openIndices = []
        boardLocked = false
      }, mismatchDelayMs)
    }
  }

  // Initial mount DOM (never torn down on language toggle so timer & flips stay intact)
  const { colsClass, rows } = getGridLayout(deck.length)
  container.innerHTML = `
    <div class="screen-body align-top memory-screen">
      <div class="nav-row">
        <button type="button" id="mem-back-btn" class="btn-ghost">
          ← ${escapeHtml(t('backHome'))}
        </button>
        <span id="mem-target-tag" class="pill-tag">${escapeHtml(t('targetLabel', { needed }))}</span>
      </div>

      <div class="hud-bar">
        <div class="hud-stat">
          <span id="mem-lbl-time" class="hud-label">${escapeHtml(t('timeLeft'))}</span>
          <span id="mem-timer" class="hud-value">${timeLeft}s</span>
        </div>
        <div class="hud-stat">
          <span id="mem-lbl-pairs" class="hud-label">${escapeHtml(t('pairsLabel'))}</span>
          <span id="mem-pairs" class="hud-value">0/${totalPairs}</span>
        </div>
        <div class="hud-stat">
          <span id="mem-lbl-score" class="hud-label">${escapeHtml(t('scoreLabel'))}</span>
          <span id="mem-score" class="hud-value">0</span>
        </div>
      </div>

      <div id="mem-banner-slot">
        <p class="memory-hint">${escapeHtml(t('memoryHint'))}</p>
      </div>

      <div
        class="memory-grid ${colsClass}"
        style="--grid-rows: ${rows}"
        role="grid"
        aria-label="Memory Match Board"
      >
        ${deck
          .map((card, idx) => {
            const label = getSymbolLabel(card.symbol)
            return `
              <button
                type="button"
                class="memory-card"
                data-idx="${idx}"
                aria-label="Hidden card"
              >
                <span class="memory-card-inner">
                  <span class="memory-card-face memory-card-back">
                    ${UI_SVGS.cardBack}
                  </span>
                  <span
                    class="memory-card-face memory-card-front"
                    style="--card-tint: ${escapeHtml(card.symbol.tint || '#ffffff')}"
                  >
                    ${getSymbolSvg(card.symbolId)}
                    <span class="memory-card-label">${escapeHtml(label)}</span>
                  </span>
                </span>
              </button>
            `
          })
          .join('')}
      </div>
    </div>
  `

  container.querySelector('#mem-back-btn').addEventListener('click', () => {
    clearTimers()
    navigate('/select')
  })

  container.querySelectorAll('.memory-card').forEach((cardEl) => {
    cardEl.addEventListener('click', () => {
      handleCardTap(Number(cardEl.dataset.idx))
    })
  })

  // Start countdown immediately
  timerId = setInterval(() => {
    if (finished) return
    timeLeft = Math.max(0, timeLeft - 1)
    updateHudValues()
    if (timeLeft <= 0) {
      completeGame(false)
    }
  }, 1000)

  return {
    onLangChange: updateLocalizedLabelsInPlace,
    destroy: clearTimers,
  }
}
