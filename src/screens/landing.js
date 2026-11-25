import { config } from '../config.js'
import { t, getEventText } from '../i18n.js'
import { getSymbolSvg } from '../icons.js'
import { launchConfetti } from '../confetti.js'
import { getOrStartSession, getDeviceId, navigate } from '../state.js'
import {
  saveRecord,
  getDeviceEligibility,
  getPublicSummary,
  unlockDeviceForFamily,
} from '../api.js'

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const CRITTERS = [
  { id: 'owl', tint: '#e0e7ff', msgKey: 'critterOwlMsg', stepIndex: 0 },
  { id: 'fox', tint: '#ffedd5', msgKey: 'critterFoxMsg', stepIndex: 1 },
  { id: 'butterfly', tint: '#e0f2fe', msgKey: 'critterButterflyMsg', stepIndex: 2 },
]

export function mountLandingScreen(container) {
  let tapCount = 0
  let tapTimer = null
  let destroyed = false

  const deviceId = getDeviceId()
  let deviceStatus = {
    locked: false,
    lastClaimCode: null,
    lastClaimedAt: null,
  }
  let livePlayers = null
  let activeCritterIndex = -1 // -1 = initial hint
  const pokedCritters = new Set()
  let easterEggTriggered = false

  let unlockModalOpen = false
  let unlockError = ''
  let unlocking = false

  // Fetch device claim eligibility & live community counter in parallel
  Promise.all([getDeviceEligibility(deviceId), getPublicSummary()]).then(([elig, summary]) => {
    if (destroyed) return
    let changed = false
    if (elig) {
      deviceStatus = {
        locked: Boolean(elig.locked),
        lastClaimCode: elig.lastClaimCode || null,
        lastClaimedAt: elig.lastClaimedAt || null,
      }
      changed = true
    }
    if (summary && typeof summary.totalPlayers === 'number') {
      livePlayers = summary.totalPlayers
      changed = true
    }
    if (changed) render()
  })

  function getSpeechText() {
    const passPercent = Math.round((Number(config.rules.passMark) || 0.8) * 100)
    if (activeCritterIndex < 0 || activeCritterIndex >= CRITTERS.length) {
      return t('tapCritterHint')
    }
    const critter = CRITTERS[activeCritterIndex]
    return t(critter.msgKey, { passPercent })
  }

  function updateInteractiveHighlight(index, fromCritterTap = false) {
    activeCritterIndex = index
    const bubble = container.querySelector('#critter-bubble')
    if (bubble) {
      bubble.textContent = getSpeechText()
      bubble.classList.remove('is-popping')
      void bubble.offsetWidth
      bubble.classList.add('is-popping')
    }

    container.querySelectorAll('.critter-btn').forEach((btn, idx) => {
      const isSelected = idx === index
      btn.classList.toggle('is-active', isSelected)
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false')
      if (isSelected && fromCritterTap) {
        btn.classList.remove('is-bouncing')
        void btn.offsetWidth
        btn.classList.add('is-bouncing')
      }
    })

    container.querySelectorAll('.step-chip-btn').forEach((chip, idx) => {
      chip.classList.toggle('is-active', idx === index)
    })

    if (fromCritterTap) {
      pokedCritters.add(index)
      if (pokedCritters.size === CRITTERS.length && !easterEggTriggered) {
        easterEggTriggered = true
        launchConfetti(1400)
      }
    }
  }

  function render() {
    if (destroyed) return
    const passPercent = Math.round((Number(config.rules.passMark) || 0.8) * 100)
    const clientName = escapeHtml(getEventText('clientName'))
    const eventName = escapeHtml(getEventText('eventName'))
    const appTitle = escapeHtml(getEventText('appTitle'))
    const liveText =
      livePlayers === null
        ? t('familyNote')
        : livePlayers > 0
          ? t('livePlayersCount', { count: livePlayers })
          : t('livePlayersFirst')

    container.innerHTML = `
      <div class="screen-body">
        <section class="card text-center landing-card">
          <div class="event-header-compact">
            <p class="event-club">${clientName}</p>
            <p class="event-name">${eventName}</p>
          </div>

          <div class="critter-stage" role="group" aria-label="Interactive forest friends">
            ${CRITTERS.map(
              (c, idx) => `
              <button
                type="button"
                class="critter-btn critter-float-${idx} ${activeCritterIndex === idx ? 'is-active' : ''}"
                style="--critter-tint: ${c.tint}"
                data-critter="${idx}"
                aria-pressed="${activeCritterIndex === idx ? 'true' : 'false'}"
                aria-label="${c.id}"
              >
                ${getSymbolSvg(c.id)}
              </button>
            `,
            ).join('')}
          </div>

          <div class="speech-bubble" id="critter-bubble" role="status" aria-live="polite">
            ${escapeHtml(getSpeechText())}
          </div>

          <h1 class="hero-title" style="margin-top: 6px">${appTitle}</h1>

          <div class="live-counter-pill">
            <span class="live-dot" aria-hidden="true"></span>
            <span>${escapeHtml(liveText)}</span>
          </div>

          ${
            deviceStatus.locked
              ? `
            <div class="notice-banner" role="status">
              ${escapeHtml(
                t('deviceClaimedBanner', {
                  code: deviceStatus.lastClaimCode || '—',
                }),
              )}
            </div>
          `
              : `
            <div class="steps-grid">
              <button type="button" class="step-chip step-chip-btn ${activeCritterIndex === 0 ? 'is-active' : ''}" data-step="0">
                <div class="step-num">1</div>
                <div class="step-title">${escapeHtml(t('step1Title'))}</div>
                <div class="step-desc">${escapeHtml(t('step1Desc'))}</div>
              </button>
              <button type="button" class="step-chip step-chip-btn ${activeCritterIndex === 1 ? 'is-active' : ''}" data-step="1">
                <div class="step-num">2</div>
                <div class="step-title">${escapeHtml(t('step2Title', { passPercent }))}</div>
                <div class="step-desc">${escapeHtml(t('step2Desc'))}</div>
              </button>
              <button type="button" class="step-chip step-chip-btn ${activeCritterIndex === 2 ? 'is-active' : ''}" data-step="2">
                <div class="step-num">3</div>
                <div class="step-title">${escapeHtml(t('step3Title'))}</div>
                <div class="step-desc">${escapeHtml(t('step3Desc'))}</div>
              </button>
            </div>
          `
          }

          <div class="btn-stack" style="margin-top: 10px">
            <button type="button" id="start-btn" class="btn btn-primary btn-shimmer">
              ${escapeHtml(deviceStatus.locked ? t('playForFunBtn') : t('startButton'))} →
            </button>

            ${
              deviceStatus.locked
                ? `
              <button type="button" id="open-family-unlock-btn" class="btn btn-secondary" style="min-height: 44px; font-size: 0.88rem">
                ${escapeHtml(t('staffUnlockFamilyBtn'))}
              </button>
            `
                : ''
            }
          </div>
        </section>

        <footer class="landing-footer">
          <button
            type="button"
            id="version-admin-trigger"
            class="footer-version-btn"
            aria-label="Version info"
          >
            ${escapeHtml(config.event.version || 'v1.0')} • ${escapeHtml(config.event.eventName)}
          </button>
        </footer>
      </div>

      ${
        unlockModalOpen
          ? `
        <div class="modal-backdrop" id="unlock-backdrop" role="dialog" aria-modal="true">
          <div class="modal-card text-center">
            <h2 class="section-title" style="margin-top: 0">${escapeHtml(t('staffUnlockTitle'))}</h2>
            <p class="lead">${escapeHtml(t('staffUnlockSubtitle'))}</p>
            <form id="unlock-form" autocomplete="off">
              <input
                type="password"
                id="unlock-pin-input"
                class="pin-input"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="8"
                placeholder="••••"
                aria-label="${escapeHtml(t('redeemPinPlaceholder'))}"
                required
              />
              <div class="error-text">${escapeHtml(unlockError)}</div>
              <div class="btn-stack" style="margin-top: 6px">
                <button type="submit" class="btn btn-teal" ${unlocking ? 'disabled' : ''}>
                  ${escapeHtml(t('staffUnlockConfirmBtn'))}
                </button>
                <button type="button" id="cancel-unlock-btn" class="btn btn-secondary" ${unlocking ? 'disabled' : ''}>
                  ${escapeHtml(t('redeemCancelBtn'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      `
          : ''
      }
    `

    container.querySelectorAll('.critter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        updateInteractiveHighlight(Number(btn.dataset.critter), true)
      })
    })

    container.querySelectorAll('.step-chip-btn').forEach((chip) => {
      chip.addEventListener('click', () => {
        updateInteractiveHighlight(Number(chip.dataset.step), true)
      })
    })

    const startBtn = container.querySelector('#start-btn')
    startBtn.addEventListener('click', () => {
      startBtn.disabled = true
      const isFun = Boolean(deviceStatus.locked)
      const { session, isNew } = getOrStartSession({ funMode: isFun })
      if (isNew) {
        saveRecord({
          sessionId: session.sessionId,
          deviceId,
          funMode: isFun,
          eventType: 'session_start',
        })
      }
      navigate('/select')
    })

    container.querySelector('#open-family-unlock-btn')?.addEventListener('click', () => {
      unlockModalOpen = true
      unlockError = ''
      render()
      container.querySelector('#unlock-pin-input')?.focus()
    })

    container.querySelector('#cancel-unlock-btn')?.addEventListener('click', () => {
      unlockModalOpen = false
      unlockError = ''
      render()
    })

    const backdrop = container.querySelector('#unlock-backdrop')
    backdrop?.addEventListener('click', (e) => {
      if (e.target === backdrop && !unlocking) {
        unlockModalOpen = false
        unlockError = ''
        render()
      }
    })

    container.querySelector('#unlock-form')?.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (unlocking) return
      const pin = (container.querySelector('#unlock-pin-input')?.value || '').trim()
      if (!pin) return
      unlocking = true
      unlockError = ''
      render()

      const res = await unlockDeviceForFamily(deviceId, pin)
      if (destroyed) return
      unlocking = false

      if (res.ok) {
        deviceStatus.locked = Boolean(res.locked)
        unlockModalOpen = false
        render()
      } else if (res.status === 403 || res.status === 401) {
        unlockError = t('redeemWrongPin')
        render()
        container.querySelector('#unlock-pin-input')?.focus()
      } else {
        unlockError = t('redeemError')
        render()
      }
    })

    // Backup Admin Access: Triple-tap footer version pill within 1.2s
    const trigger = container.querySelector('#version-admin-trigger')
    trigger.addEventListener('click', () => {
      tapCount += 1
      clearTimeout(tapTimer)
      if (tapCount >= 3) {
        tapCount = 0
        navigate('/admin')
        return
      }
      tapTimer = setTimeout(() => {
        tapCount = 0
      }, 1200)
    })
  }

  render()

  return {
    onLangChange: render,
    destroy() {
      destroyed = true
      clearTimeout(tapTimer)
    },
  }
}
