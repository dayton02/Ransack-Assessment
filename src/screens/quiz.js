import { config } from '../config.js'
import { t, getLocalizedQuestion } from '../i18n.js'
import {
  ensureActiveSession,
  updateSession,
  getDeviceId,
  evaluateScore,
  getActiveQuizQuestions,
  navigate,
} from '../state.js'
import { saveRecord } from '../api.js'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function mountQuizScreen(container) {
  const session = ensureActiveSession()
  const rawQuestions = getActiveQuizQuestions()
  const pointsPerCorrect = Number(config.quiz.pointsPerCorrect) || 1
  const maxScore = Math.max(1, rawQuestions.length) * pointsPerCorrect
  const { needed } = evaluateScore(0, maxScore)

  let currentIndex = 0
  let score = 0
  let selectedOptionIndex = null
  let isSubmitting = false

  async function finishQuiz() {
    if (isSubmitting) return
    isSubmitting = true
    const summary = evaluateScore(score, maxScore)
    const resultRecord = {
      gameId: 'quiz',
      ...summary,
    }

    const res = await saveRecord({
      sessionId: session.sessionId,
      deviceId: getDeviceId(),
      funMode: Boolean(session.funMode),
      eventType: 'game_completed',
      gameId: 'quiz',
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

    navigate(summary.won ? '/win' : '/result')
  }

  function render() {
    if (rawQuestions.length === 0) {
      navigate('/select')
      return
    }

    const rawQ = rawQuestions[currentIndex]
    const q = getLocalizedQuestion(rawQ)
    const total = rawQuestions.length
    const progressPct = Math.round(((currentIndex + (selectedOptionIndex !== null ? 1 : 0)) / total) * 100)
    const answered = selectedOptionIndex !== null
    const isCorrect = answered && selectedOptionIndex === q.answerIndex
    const isLast = currentIndex === total - 1
    const correctAnswerText = q.options[q.answerIndex] ?? ''

    container.innerHTML = `
      <div class="screen-body align-top">
        <div class="nav-row">
          <button type="button" id="quiz-back-btn" class="btn-ghost">
            ← ${escapeHtml(t('backHome'))}
          </button>
          <span class="pill-tag">${escapeHtml(t('targetLabel', { needed }))}</span>
        </div>

        <div class="hud-bar">
          <div class="hud-stat" style="align-items: flex-start; flex: 1">
            <span class="hud-label">${escapeHtml(t('quizTitle'))}</span>
            <span class="hud-value" style="font-size: 0.96rem">
              ${escapeHtml(t('questionProgress', { current: currentIndex + 1, total }))}
            </span>
          </div>
          <div class="hud-stat">
            <span class="hud-label">${escapeHtml(t('scoreLabel'))}</span>
            <span class="hud-value">${score} / ${maxScore}</span>
          </div>
        </div>

        <section class="card">
          <div class="progress-track" aria-hidden="true">
            <div class="progress-fill" style="width: ${progressPct}%"></div>
          </div>

          <h1 class="quiz-question-text">${escapeHtml(q.question)}</h1>

          <div class="quiz-options">
            ${q.options
              .map((opt, idx) => {
                let stateClass = ''
                if (answered) {
                  if (idx === q.answerIndex) stateClass = 'is-correct'
                  else if (idx === selectedOptionIndex) stateClass = 'is-wrong'
                }
                const letter = LETTERS[idx] || String(idx + 1)
                return `
                  <button
                    type="button"
                    class="quiz-option-btn ${stateClass}"
                    data-idx="${idx}"
                    ${answered ? 'disabled' : ''}
                  >
                    <span class="quiz-option-letter">${letter}</span>
                    <span>${escapeHtml(opt)}</span>
                  </button>
                `
              })
              .join('')}
          </div>

          ${
            answered
              ? `
            <div class="quiz-feedback ${isCorrect ? 'is-correct' : 'is-wrong'}" role="status">
              ${escapeHtml(
                isCorrect
                  ? t('correctFeedback')
                  : t('wrongFeedback', { answer: correctAnswerText }),
              )}
            </div>
            <div class="btn-stack">
              <button type="button" id="quiz-next-btn" class="btn btn-primary" ${isSubmitting ? 'disabled' : ''}>
                ${escapeHtml(isLast ? t('seeResult') : t('nextQuestion'))} →
              </button>
            </div>
          `
              : ''
          }
        </section>
      </div>
    `

    container.querySelector('#quiz-back-btn').addEventListener('click', () => {
      navigate('/select')
    })

    if (!answered) {
      container.querySelectorAll('.quiz-option-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx)
          selectedOptionIndex = idx
          if (idx === q.answerIndex) {
            score += pointsPerCorrect
          }
          render()
        })
      })
    } else {
      const nextBtn = container.querySelector('#quiz-next-btn')
      nextBtn?.addEventListener('click', () => {
        if (isLast) {
          finishQuiz()
        } else {
          currentIndex += 1
          selectedOptionIndex = null
          render()
        }
      })
    }
  }

  render()

  return {
    // Re-renders the exact current question & options in the new language without losing progress
    onLangChange: render,
  }
}
