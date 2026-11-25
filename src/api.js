// Your app's connection to the "database" (the server in server.js).
// Use these from your screens, the same way you'd use a database service.

// Call this whenever something worth recording happens.
export async function saveRecord(record) {
  // TODO: send `record` to POST /api/records
}

// Call this from the Admin Screen to get everything that was saved.
export async function getRecords() {
  // TODO: fetch the records from GET /api/records
  return []
}

// Change these functions or add your own if you prefer.
