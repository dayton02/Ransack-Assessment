import { config } from '../config.js'
import { t, getEventText } from '../i18n.js'
import { UI_SVGS } from '../icons.js'
import { getOrStartSession, getDeviceId, navigate } from '../state.js'
import { saveRecord, getDeviceEligibility, unlockDeviceForFamily } from '../api.js'

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

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
  let unlockModalOpen = false
  let unlockError = ''
  let unlocking = false

  getDeviceEligibility(deviceId).then((res) => {
    if (destroyed || !res) return
    deviceStatus = {
      locked: Boolean(res.locked),
      lastClaimCode: res.lastClaimCode || null,
      lastClaimedAt: res.lastClaimedAt || null,
    }
    render()
  })

  function render() {
    if (destroyed) return
    const passPercent = Math.round((Number(config.rules.passMark) || 0.8) * 100)
    const clientName = escapeHtml(getEventText('clientName'))
    const eventName = escapeHtml(getEventText('eventName'))
    const appTitle = escapeHtml(getEventText('appTitle'))
    const tagline = escapeHtml(getEventText('tagline'))

    container.innerHTML = `
      <div class="screen-body">
        <section class="card text-center">
          <div class="hero-icon-wrap">${UI_SVGS.tree}</div>
          <p class="event-club">${clientName}</p>
          <p class="event-name">${eventName}</p>
          <h1 class="hero-title">${appTitle}</h1>
          <p class="lead">${tagline}</p>

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
              <div class="step-chip">
                <div class="step-num">1</div>
                <div class="step-title">${escapeHtml(t('step1Title'))}</div>
                <div class="step-desc">${escapeHtml(t('step1Desc'))}</div>
              </div>
              <div class="step-chip">
                <div class="step-num">2</div>
                <div class="step-title">${escapeHtml(t('step2Title', { passPercent }))}</div>
                <div class="step-desc">${escapeHtml(t('step2Desc'))}</div>
              </div>
              <div class="step-chip">
                <div class="step-num">3</div>
                <div class="step-title">${escapeHtml(t('step3Title'))}</div>
                <div class="step-desc">${escapeHtml(t('step3Desc'))}</div>
              </div>
            </div>
          `
          }

          <div class="btn-stack" style="margin-top: 14px">
            <button type="button" id="start-btn" class="btn btn-primary">
              ${escapeHtml(deviceStatus.locked ? t('playForFunBtn') : t('startButton'))}
            </button>

            ${
              deviceStatus.locked
                ? `
              <button type="button" id="open-family-unlock-btn" class="btn btn-secondary" style="min-height: 46px; font-size: 0.92rem">
                ${escapeHtml(t('staffUnlockFamilyBtn'))}
              </button>
            `
                : ''
            }
          </div>

          <p class="muted" style="margin: 12px 0 0">${escapeHtml(t('familyNote'))}</p>
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
