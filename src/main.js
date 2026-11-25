import './style.css'
import { applyDocumentLang, onLangChange, renderLanguageBar } from './i18n.js'
import { getRoute } from './state.js'
import { mountLandingScreen } from './screens/landing.js'
import { mountSelectScreen } from './screens/select.js'
import { mountQuizScreen } from './screens/quiz.js'
import { mountMemoryScreen } from './screens/memory.js'
import { mountResultScreen } from './screens/result.js'
import { mountFinalScreen } from './screens/final.js'
import { mountAdminScreen } from './screens/admin.js'

const appRoot = document.querySelector('#app')
appRoot.innerHTML = `
  <div class="app-shell" id="app-shell">
    <header class="top-bar" id="lang-bar-slot"></header>
    <main id="screen-root" style="flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column;"></main>
  </div>
`

const shellEl = document.querySelector('#app-shell')
const langBarSlot = document.querySelector('#lang-bar-slot')
const screenRoot = document.querySelector('#screen-root')

let activeScreen = null

function resolveScreen(route) {
  switch (route) {
    case '/':
      return { mount: mountLandingScreen, isAdmin: false, viewportFit: false }
    case '/select':
      return { mount: mountSelectScreen, isAdmin: false, viewportFit: false }
    case '/play/quiz':
      return { mount: mountQuizScreen, isAdmin: false, viewportFit: false }
    case '/play/memory':
      return { mount: mountMemoryScreen, isAdmin: false, viewportFit: true }
    case '/result':
      return { mount: mountResultScreen, isAdmin: false, viewportFit: false }
    case '/win':
      return { mount: mountFinalScreen, isAdmin: false, viewportFit: false }
    case '/admin':
      return { mount: mountAdminScreen, isAdmin: true, viewportFit: false }
    default:
      return { mount: mountLandingScreen, isAdmin: false, viewportFit: false }
  }
}

function mountCurrentRoute() {
  if (activeScreen?.destroy) {
    activeScreen.destroy()
  }
  activeScreen = null

  const route = getRoute()
  const { mount, isAdmin, viewportFit } = resolveScreen(route)

  shellEl.classList.toggle('is-admin', isAdmin)
  shellEl.classList.toggle('is-viewport-fit', Boolean(viewportFit))
  document.documentElement.classList.toggle('is-player-app', !isAdmin)
  document.body.classList.toggle('is-player-app', !isAdmin)
  screenRoot.style.overflow = isAdmin ? 'visible' : 'hidden'
  langBarSlot.style.display = isAdmin ? 'none' : ''
  if (!isAdmin) {
    renderLanguageBar(langBarSlot)
  }

  window.scrollTo({ top: 0, behavior: 'instant' })
  activeScreen = mount(screenRoot) || {}
}

applyDocumentLang()

onLangChange(() => {
  const isAdmin = getRoute() === '/admin'
  if (!isAdmin) {
    renderLanguageBar(langBarSlot)
  }
  if (activeScreen?.onLangChange) {
    activeScreen.onLangChange()
  }
})

window.addEventListener('hashchange', mountCurrentRoute)
mountCurrentRoute()
