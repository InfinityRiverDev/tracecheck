// Render exposes one public port. The quiz leaderboard stays on loopback and
// server.mjs proxies its HTTP/WebSocket traffic through the public HTTPS origin.
const publicPort = Number(process.env.PORT) || 3000
const internalPort = Number(process.env.LEADERBOARD_INTERNAL_PORT) || 8787
if (publicPort === internalPort) throw new Error('PORT and LEADERBOARD_INTERNAL_PORT must be different')

const { startQuizLeaderboardServer } = await import('./server/leaderboard.mjs')
const quiz = await startQuizLeaderboardServer({ port: internalPort })

const { createTraceCheckServer } = await import('./server.mjs')
const server = createTraceCheckServer()
server.listen(publicPort, '0.0.0.0', () => {
  console.log(`TraceCheck Render service on :${publicPort}`)
})

let stopping = false
async function shutdown(signal) {
  if (stopping) return
  stopping = true
  console.log(`TraceCheck received ${signal}; flushing data`)
  const deadline = setTimeout(() => process.exit(1), 8000)
  deadline.unref?.()
  await quiz.close()
  await new Promise(resolve => server.close(resolve))
  clearTimeout(deadline)
  process.exit(0)
}
process.once('SIGTERM', () => { void shutdown('SIGTERM') })
process.once('SIGINT', () => { void shutdown('SIGINT') })
