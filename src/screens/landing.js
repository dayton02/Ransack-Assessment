import { config } from '../config.js'
import { t, getEventText } from '../i18n.js'
import { UI_SVGS } from '../icons.js'
import { startNewSession, navigate } from '../state.js'
import { saveRecord } from '../api.js'

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

  function render() {
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

          <button type="button" id="start-btn" class="btn btn-primary">
            ${escapeHtml(t('startButton'))}
          </button>
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
    `

    const startBtn = container.querySelector('#start-btn')
    startBtn.addEventListener('click', () => {
      startBtn.disabled = true
      const session = startNewSession()
      // Fire-and-forget session start so navigation is instant even on slow Wi-Fi
      saveRecord({
        sessionId: session.sessionId,
        eventType: 'session_start',
      })
      navigate('/select')
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
      clearTimeout(tapTimer)
    },
  }
}
