import './style.css'
import questions from './data/questions.json'

// This placeholder only proves your setup works.
// Replace it with your own app.
document.querySelector('#app').innerHTML = `
  <main class="placeholder">
    <h1>Setup works!</h1>
    <p>${questions.length} quiz questions loaded.</p>
    <p id="server-status">Checking server…</p>
    <p>Replace this screen with your app.</p>
  </main>
`

fetch('/api/ping')
  .then((res) => res.json())
  .then(() => {
    document.querySelector('#server-status').textContent = 'Server connected ✓'
  })
  .catch(() => {
    document.querySelector('#server-status').textContent =
      'Server not running. Start the app with npm start.'
  })
