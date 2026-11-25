// Passes any request starting with /api to the server (server.js),
// so phones on your Wi-Fi can reach it through the app's address.
export default {
  server: { proxy: { '/api': 'http://localhost:3001' } },
}
