// Frontend connection to the local backend server (server.js via Vite /api proxy).

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
  }
}

/**
 * Save an event record to the shared server database.
 * Called on: session_start, game_picked, game_completed, final_screen_view.
 */
export async function saveRecord(record) {
  try {
    const res = await requestJson('/api/records', {
      method: 'POST',
      body: JSON.stringify(record),
    })
    return res.data || { ok: false }
  } catch {
    return { ok: false, networkError: true }
  }
}

/**
 * Fetch all raw saved records (requires verified staff PIN).
 */
export async function getRecords(pin) {
  const res = await requestJson('/api/records', {
    method: 'GET',
    headers: { 'X-Admin-Pin': pin },
  })
  if (!res.ok) {
    throw new Error(res.data?.error || 'Failed to fetch records')
  }
  return res.data
}

/**
 * Fetch authoritative session claim state from the server.
 */
export async function getSessionStatus(sessionId) {
  try {
    const res = await requestJson(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
    })
    if (!res.ok) return null
    return res.data?.session || null
  } catch {
    return null
  }
}

/**
 * Mark a winning session's prize as redeemed (requires 4-digit staff PIN).
 */
export async function redeemPrize(sessionId, pin) {
  try {
    const res = await requestJson(`/api/sessions/${encodeURIComponent(sessionId)}/redeem`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    })
    return {
      ok: res.ok && Boolean(res.data?.ok),
      status: res.status,
      ...(res.data || {}),
    }
  } catch {
    return { ok: false, status: 0, networkError: true }
  }
}

/**
 * Verify 4-digit staff PIN for Admin Dashboard access.
 */
export async function verifyAdminPin(pin) {
  try {
    const res = await requestJson('/api/admin/verify', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    })
    return { ok: res.ok && Boolean(res.data?.ok), status: res.status }
  } catch {
    return { ok: false, status: 0, networkError: true }
  }
}

/**
 * Fetch aggregated Admin Dashboard stats and claim list.
 */
export async function getAdminStats(pin) {
  const res = await requestJson('/api/admin/stats', {
    method: 'GET',
    headers: { 'X-Admin-Pin': pin },
  })
  if (!res.ok) {
    const err = new Error(res.data?.error || 'Unauthorized')
    err.status = res.status
    throw err
  }
  return res.data.stats
}

/**
 * Redeem a prize by its claim code directly from the Admin Dashboard.
 */
export async function redeemClaimCode(claimCode, pin) {
  const res = await requestJson('/api/admin/redeem-code', {
    method: 'POST',
    headers: { 'X-Admin-Pin': pin },
    body: JSON.stringify({ claimCode }),
  })
  return {
    ok: res.ok && Boolean(res.data?.ok),
    status: res.status,
    ...(res.data || {}),
  }
}

/**
 * Download all sessions as a CSV file (triggers browser download).
 */
export async function downloadSessionsCsv(pin) {
  const response = await fetch('/api/admin/export.csv', {
    headers: { 'X-Admin-Pin': pin },
  })
  if (!response.ok) {
    throw new Error('Failed to export CSV')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `play-and-win-sessions-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Clear all stored records (Admin reset for wiping pre-event test data).
 */
export async function resetAllStats(pin) {
  const res = await requestJson('/api/admin/reset', {
    method: 'POST',
    headers: { 'X-Admin-Pin': pin },
  })
  return res.ok && Boolean(res.data?.ok)
}
