// Render exposes one public port. The quiz leaderboard stays on loopback and
// server.mjs proxies its HTTP/WebSocket traffic through the public HTTPS origin.
const publicPort = Number(process.env.PORT) || 10000
const internalPort = Number(process.env.LEADERBOARD_INTERNAL_PORT) || 8787

process.env.PORT = String(internalPort)
await import('./server/leaderboard.mjs')

process.env.PORT = String(publicPort)
const { createTraceCheckServer } = await import('./server.mjs')
const server = createTraceCheckServer()
server.listen(publicPort, '0.0.0.0', () => {
  console.log(`TraceCheck Render service on :${publicPort}`)
})
