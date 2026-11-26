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

function buzz(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    // Ignore on unsupported browsers
  }
}

export function mountMemoryScreen(container) {
  const session = ensureActiveSession()
  const symbols = getActiveMemorySymbols()
  const totalPairs = symbols.length
  const pointsPerPair = Number(config.memory.pointsPerPair) || 100
  const maxScore = totalPairs * pointsPerPair
  const timeLimitSeconds = Math.min(59, Math.max(5, Number(config.memory.timeLimitSeconds) || 45))
  const previewSeconds = Math.max(0, Math.min(5, Number(config.memory.previewSeconds ?? 2)))
  const mismatchDelayMs = Number(config.memory.mismatchDelayMs) || 750
  const { needed } = evaluateScore(0, maxScore)

  const deck = shuffle(
    symbols.flatMap((sym) => [
      { uid: `${sym.id}-a`, symbolId: sym.id, symbol: sym, flipped: false, matched: false },
      { uid: `${sym.id}-b`, symbolId: sym.id, symbol: sym, flipped: false, matched: false },
    ]),
  )

  let timeLeft = timeLimitSeconds
  let peekRemaining = previewSeconds
  let inPreview = previewSeconds > 0
  let matchedPairs = 0
  let score = 0
  let streak = 0
  let openIndices = []
  let boardLocked = inPreview
  let finished = false
  let bannerState = inPreview ? { type: 'peek' } : { type: 'hint' }

  let timerId = null
  let peekInterval = null
  let mismatchTimeout = null
  let finishTimeout = null

  function clearTimers() {
    clearInterval(timerId)
    clearInterval(peekInterval)
    clearTimeout(mismatchTimeout)
    clearTimeout(finishTimeout)
    timerId = null
    peekInterval = null
  }

  function startCountdown() {
    if (timerId || finished) return
    timerId = setInterval(() => {
      if (finished) return
      timeLeft = Math.max(0, timeLeft - 1)
      updateHudValues()
      if (timeLeft <= 0) {
        completeGame(false)
      }
    }, 1000)
  }

  async function completeGame(clearedEarly) {
    if (finished) return
    finished = true
    boardLocked = true
    clearInterval(timerId)
    clearInterval(peekInterval)
    clearTimeout(mismatchTimeout)

    bannerState = { type: clearedEarly ? 'master' : 'timeout' }
    updateBanner(true)

    if (clearedEarly) {
      buzz([30, 40, 60])
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
    const barEl = container.querySelector('#mem-timer-fill')
    const targetTag = container.querySelector('#mem-target-tag')

    const ratio = timeLimitSeconds > 0 ? timeLeft / timeLimitSeconds : 0
    if (timerEl) {
      timerEl.textContent = `${timeLeft}s`
      timerEl.classList.toggle('is-urgent', !inPreview && timeLeft <= 10 && !finished)
    }
    if (barEl) {
      barEl.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`
      barEl.classList.toggle('is-warn', ratio <= 0.35 && ratio > 0.2)
      barEl.classList.toggle('is-urgent', ratio <= 0.2)
    }
    if (scoreEl) {
      scoreEl.textContent = `${score}`
      scoreEl.classList.toggle('is-winning', score >= needed)
    }
    if (pairsEl) pairsEl.textContent = `${matchedPairs}/${totalPairs}`
    if (targetTag) {
      targetTag.classList.toggle('is-reached', score >= needed)
    }
  }

  function getBannerText() {
    switch (bannerState.type) {
      case 'peek':
        return t('memoryPeekBanner', { seconds: peekRemaining })
      case 'master':
        return t('forestMasterBanner')
      case 'timeout':
        return t('timesUpBanner')
      case 'win_unlocked':
        return t('memoryWinUnlocked')
      case 'streak':
        return t('memoryStreakBanner', { streak: bannerState.streak, points: pointsPerPair })
      case 'match':
        return t('memoryMatchBanner', { points: pointsPerPair })
      default:
        return t('memoryHint')
    }
  }

  function updateBanner(animate = false) {
    const bubbleEl = container.querySelector('#mem-fox-bubble')
    const avatarEl = container.querySelector('#mem-fox-avatar')
    if (!bubbleEl || !avatarEl) return

    bubbleEl.textContent = getBannerText()
    bubbleEl.classList.remove('is-match', 'is-master', 'is-timeout', 'is-peek', 'is-popping')
    avatarEl.classList.remove('is-happy', 'is-peek')

    if (bannerState.type === 'master') {
      bubbleEl.classList.add('is-master')
      avatarEl.classList.add('is-happy')
    } else if (bannerState.type === 'timeout') {
      bubbleEl.classList.add('is-timeout')
    } else if (bannerState.type === 'peek') {
      bubbleEl.classList.add('is-peek')
      avatarEl.classList.add('is-peek')
    } else if (
      bannerState.type === 'match' ||
      bannerState.type === 'streak' ||
      bannerState.type === 'win_unlocked'
    ) {
      bubbleEl.classList.add('is-match')
      avatarEl.classList.add('is-happy')
    }

    if (animate) {
      void bubbleEl.offsetWidth
      bubbleEl.classList.add('is-popping')
    }
  }

  function spawnScoreFloat(cardEl) {
    if (!cardEl) return
    const badge = document.createElement('span')
    badge.className = 'mem-score-float'
    badge.textContent = `+${pointsPerPair}`
    cardEl.appendChild(badge)
    setTimeout(() => badge.remove(), 750)
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
        cardEl.setAttribute(
          'aria-label',
          inPreview || deck[idx].flipped || deck[idx].matched ? label : 'Hidden card',
        )
      }
    })
    updateBanner(false)
  }

  function handleCardTap(index) {
    if (finished || boardLocked || inPreview) return
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
      const prevScore = score
      first.matched = true
      second.matched = true
      matchedPairs += 1
      score += pointsPerPair
      streak += 1
      openIndices = []

      const firstEl = container.querySelector(`.memory-card[data-idx="${firstIdx}"]`)
      const secondEl = container.querySelector(`.memory-card[data-idx="${secondIdx}"]`)
      firstEl?.classList.add('is-matched')
      secondEl?.classList.add('is-matched')
      firstEl?.setAttribute('disabled', 'true')
      secondEl?.setAttribute('disabled', 'true')

      buzz(22)
      spawnScoreFloat(secondEl)
      updateHudValues()

      if (matchedPairs >= totalPairs) {
        completeGame(true)
      } else {
        if (prevScore < needed && score >= needed) {
          bannerState = { type: 'win_unlocked' }
        } else if (streak >= 2) {
          bannerState = { type: 'streak', streak }
        } else {
          bannerState = { type: 'match' }
        }
        updateBanner(true)
      }
    } else {
      streak = 0
      boardLocked = true
      const firstEl = container.querySelector(`.memory-card[data-idx="${firstIdx}"]`)
      const secondEl = container.querySelector(`.memory-card[data-idx="${secondIdx}"]`)
      firstEl?.classList.add('is-mismatch')
      secondEl?.classList.add('is-mismatch')

      mismatchTimeout = setTimeout(() => {
        first.flipped = false
        second.flipped = false
        firstEl?.classList.remove('is-flipped', 'is-mismatch')
        secondEl?.classList.remove('is-flipped', 'is-mismatch')
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

      <div class="hud-bar mem-hud-bar">
        <div class="mem-hud-row">
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
        <div class="mem-timer-track" aria-hidden="true">
          <div id="mem-timer-fill" class="mem-timer-fill" style="width: 100%"></div>
        </div>
      </div>

      <div class="mem-host-strip">
        <div id="mem-fox-avatar" class="mem-fox-avatar ${inPreview ? 'is-peek' : ''}" aria-hidden="true">
          ${getSymbolSvg('fox')}
        </div>
        <div id="mem-fox-bubble" class="mem-fox-bubble ${inPreview ? 'is-peek' : ''}" role="status">
          ${escapeHtml(getBannerText())}
        </div>
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
                class="memory-card ${inPreview ? 'is-flipped' : ''}"
                data-idx="${idx}"
                aria-label="${inPreview ? escapeHtml(label) : 'Hidden card'}"
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

  // Quick Peek sequence before starting the 45s game timer
  if (inPreview) {
    peekInterval = setInterval(() => {
      peekRemaining -= 1
      if (peekRemaining > 0) {
        updateBanner(false)
      } else {
        clearInterval(peekInterval)
        peekInterval = null
        inPreview = false
        boardLocked = false
        container.querySelectorAll('.memory-card').forEach((cardEl) => {
          cardEl.classList.remove('is-flipped')
          cardEl.setAttribute('aria-label', 'Hidden card')
        })
        bannerState = { type: 'hint' }
        updateBanner(true)
        startCountdown()
      }
    }, 1000)
  } else {
    startCountdown()
  }

  return {
    onLangChange: updateLocalizedLabelsInPlace,
    destroy: clearTimers,
  }
}
