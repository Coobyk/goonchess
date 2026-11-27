import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PORT = Number.parseInt(process.env.ROOM_E2E_PORT ?? '8787', 10)
const BASE = process.env.ROOM_E2E_BASE ?? `http://127.0.0.1:${PORT}`
const EXTERNAL_SERVER = process.env.ROOM_E2E_BASE !== undefined
// Not a credential: this value only lets the temporary local worker sign test challenges.
const TEST_CAPTCHA_SECRET = 'goonchess-room-e2e'
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const WRANGLER = fileURLToPath(new URL('../node_modules/wrangler/wrangler-dist/cli.js', import.meta.url))
const DIST_INDEX = fileURLToPath(new URL('../dist/index.html', import.meta.url))
const START_TIMEOUT = 60_000

function sha256(data) {
  return createHash('sha256').update(data).digest()
}

function leadingZeros(buf) {
  let bits = 0
  for (const b of buf) {
    if (b === 0) {
      bits += 8
      continue
    }
    bits += Math.clz32(b) - 24
    break
  }
  return bits
}

function solve(salt, bits) {
  for (let nonce = 0; nonce < 5_000_000; nonce++) {
    if (leadingZeros(sha256(`${salt}.${nonce}`)) >= bits) return String(nonce)
  }
  throw new Error('proof of work did not converge')
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function wsUrl(code, token) {
  const url = new URL(`/api/games/${code}/ws`, BASE)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const messages = []
    const waiters = new Set()
    let opened = false
    const handshake = setTimeout(() => {
      if (opened) return
      socket.close()
      reject(new Error(`timeout opening websocket: ${url}`))
    }, 5000)

    const matches = (pred, msg) => {
      try {
        return pred(msg)
      } catch {
        return false
      }
    }

    const rejectWaiters = (error) => {
      for (const waiter of waiters) {
        clearTimeout(waiter.timer)
        waiter.reject(error)
      }
      waiters.clear()
    }

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      messages.push(msg)
      for (const waiter of [...waiters]) {
        if (!matches(waiter.pred, msg)) continue
        waiters.delete(waiter)
        clearTimeout(waiter.timer)
        waiter.resolve(msg)
      }
    }
    socket.onclose = () => {
      clearTimeout(handshake)
      if (!opened) reject(new Error('websocket closed before opening'))
      rejectWaiters(new Error('websocket closed while waiting for a message'))
    }
    socket.onerror = () => {
      clearTimeout(handshake)
      if (!opened) reject(new Error(`websocket connection failed: ${url}`))
    }
    socket.onopen = () => {
      clearTimeout(handshake)
      opened = true
      resolve({
        socket,
        messages,
        send: (message) => socket.send(JSON.stringify(message)),
        mark: () => messages.length,
        next: (pred, { timeout = 5000, since = 0, label = 'message' } = {}) => {
          for (let i = since; i < messages.length; i++) {
            if (matches(pred, messages[i])) return Promise.resolve(messages[i])
          }
          return new Promise((res, rej) => {
            const waiter = { pred, resolve: res, reject: rej, timer: null }
            waiter.timer = setTimeout(() => {
              waiters.delete(waiter)
              rej(new Error(`timeout waiting for ${label}`))
            }, timeout)
            waiters.add(waiter)
          })
        },
        close: async () => {
          if (socket.readyState === 3) return
          await new Promise((res) => {
            const finish = () => {
              clearTimeout(timer)
              socket.removeEventListener('close', finish)
              res()
            }
            const timer = setTimeout(finish, 1000)
            socket.addEventListener('close', finish, { once: true })
            socket.close()
          })
        },
      })
    }
  })
}

function wranglerOutput(server) {
  const output = server.output.trim()
  return output ? `\n--- wrangler output ---\n${output}` : '\n--- wrangler produced no output ---'
}

async function waitForExit(server, timeout) {
  if (server.exit) return true
  let timer
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeout)
  })
  const exited = await Promise.race([server.exited.then(() => true), timedOut])
  clearTimeout(timer)
  return exited
}

async function stopWrangler(server) {
  if (!server) return
  const { child } = server

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }

  // Wrangler spawns workerd underneath it. Signal the whole process group on
  // Linux even if the Wrangler parent has already exited, so workerd cannot be
  // left behind as an orphan in CI. The test server is disposable, so SIGKILL
  // is a harmless backstop after a short graceful shutdown window.
  const killGroup = (signal) => {
    try {
      process.kill(-child.pid, signal)
      return true
    } catch {
      return false
    }
  }

  if (!killGroup('SIGTERM') && !server.exit) {
    try {
      child.kill('SIGTERM')
    } catch {
      // Already gone.
    }
  }
  if (!server.exit) await waitForExit(server, 1500)

  await delay(200)
  killGroup('SIGKILL')
  if (!server.exit) {
    try {
      child.kill('SIGKILL')
    } catch {
      // Already gone.
    }
    await waitForExit(server, 1000)
  }
}

function ensureDist() {
  if (existsSync(DIST_INDEX)) return
  console.log('dist/index.html is missing; running npm run build')
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = spawnSync(npm, ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`npm run build failed with exit code ${result.status}`)
  if (!existsSync(DIST_INDEX)) throw new Error('npm run build completed without producing dist/index.html')
}

async function assertPortFree() {
  try {
    await fetch(`${BASE}/api/challenge`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(750),
    })
    throw new Error(`${BASE} is already in use; stop that server or set ROOM_E2E_PORT`)
  } catch (error) {
    if (error.message.startsWith(`${BASE} is already in use`)) throw error
    if (error.code === 'ECONNREFUSED' || error.cause?.code === 'ECONNREFUSED') return
    throw new Error(`${BASE} is not available for the room e2e server; stop whatever uses it or set ROOM_E2E_PORT`)
  }
}

async function startWrangler() {
  if (EXTERNAL_SERVER) return null
  if (!existsSync(WRANGLER)) throw new Error('wrangler is not installed; run npm ci first')
  ensureDist()
  await assertPortFree()

  const child = spawn(process.execPath, [
    WRANGLER,
    'dev',
    '--ip',
    '127.0.0.1',
    '--port',
    String(PORT),
    '--var',
    `CAPTCHA_SECRET:${TEST_CAPTCHA_SECRET}`,
  ], {
    cwd: ROOT,
    detached: process.platform !== 'win32',
    env: { ...process.env, CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const server = {
    child,
    output: '',
    exit: null,
    exited: null,
  }
  server.exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      server.exit = { code, signal }
      resolve(server.exit)
    })
  })
  const append = (chunk) => {
    server.output = `${server.output}${chunk}`.slice(-16_000)
    if (process.env.ROOM_E2E_VERBOSE) process.stderr.write(chunk)
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  try {
    const deadline = Date.now() + START_TIMEOUT
    while (Date.now() < deadline) {
      if (server.exit) {
        throw new Error(`wrangler dev exited before becoming ready (code ${server.exit.code}, signal ${server.exit.signal})${wranglerOutput(server)}`)
      }
      try {
        const response = await fetch(`${BASE}/api/challenge`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(1000),
        })
        if (response.ok) return server
        const body = await response.text().catch(() => '')
        if (response.status === 503) {
          throw new Error(`captcha_unconfigured from wrangler dev; the test --var did not reach the worker${wranglerOutput(server)}`)
        }
        throw new Error(`unexpected /api/challenge status ${response.status}: ${body}${wranglerOutput(server)}`)
      } catch (error) {
        if (error.message.startsWith('captcha_unconfigured') || error.message.startsWith('unexpected /api/challenge')) throw error
      }
      await delay(250)
    }

    throw new Error(`timed out waiting for wrangler dev on ${BASE}${wranglerOutput(server)}`)
  } catch (error) {
    await stopWrangler(server)
    throw error
  }
}

async function fetchJson(path, options) {
  const response = await fetch(`${BASE}${path}`, { ...options, signal: AbortSignal.timeout(5000) })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`${path} returned non-JSON response ${response.status}: ${text.slice(0, 200)}`)
  }
  if (!response.ok) {
    const details = Array.isArray(body.details) ? ` (${body.details.join('; ')})` : ''
    const message = [body.error, body.message].filter(Boolean).join(': ') || text.slice(0, 200)
    throw new Error(`${path} failed with ${response.status}: ${message}${details}`)
  }
  return body
}

function summarize(client) {
  return client.messages.map((m) => {
    if (m.t === 'state') {
      return `state:hist${m.game?.moveHistory?.length ?? '?'}${m.game?.winner ? `:winner=${m.game.winner}` : ''}`
    }
    if (m.t === 'error') return `error:${m.code}`
    if (m.kind) return `${m.t}:${m.kind}`
    return m.t
  })
}

async function runRoomTest() {
  let a = null
  let b = null

  try {
    // 1. create a room
    const challenge = await fetchJson('/api/challenge')
    const solution = solve(challenge.salt, challenge.bits)
    const created = await fetchJson('/api/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        variant: classic,
        captcha: { challenge: challenge.challenge, solution },
        clock: { minutes: 5, increment: 3 },
      }),
    })
    assert(created.code && created.token, 'create response did not include a room code and seat token')
    console.log('created room:', created.code)

    // 2. both seats connect
    a = await connect(wsUrl(created.code, created.token))
    const helloA = await a.next((m) => m.t === 'hello', { label: 'A hello' })
    assert(helloA.you.seat === 0, `expected creator in seat 0, got ${helloA.you.seat}`)

    const openingMark = a.mark()
    b = await connect(wsUrl(created.code))
    const helloB = await b.next((m) => m.t === 'hello', { label: 'B hello' })
    assert(helloB.you.seat === 1, `expected joiner in seat 1, got ${helloB.you.seat}`)
    assert(helloB.started === true, 'game was not started when the second seat connected')
    assert(helloB.game, 'B hello did not include the opening game')
    console.log('seats connected; opening history:', helloB.game.moveHistory.length)

    // The room deals the opening position to whoever was already waiting.
    await a.next((m) => m.t === 'state' && !!m.game, { since: openingMark, label: 'opening state at A' })

    // 3. white (seat 0 = A) plays e2-e4
    let mark = b.mark()
    a.send({ t: 'move', from: { x: 4, y: 6 }, to: { x: 4, y: 4 }, finalTo: { x: 4, y: 4 } })
    const stateB = await b.next((m) => m.t === 'state' && m.game.moveHistory.length === 1, {
      since: mark,
      label: 'first move at B',
    })
    console.log('move played, B sees history:', stateB.game.moveHistory.length)

    // 4. undo offer: B offers, A accepts
    mark = a.mark()
    b.send({ t: 'offer', kind: 'undo' })
    const offer = await a.next((m) => m.t === 'offer' && m.kind === 'undo', {
      since: mark,
      label: 'undo offer at A',
    })
    assert(offer.seat === 1, `expected undo offer from seat 1, got ${offer.seat}`)

    const undoneMark = b.mark()
    const acceptedMark = a.mark()
    a.send({ t: 'offer-response', kind: 'undo', accept: true })
    const undone = await b.next((m) => m.t === 'state' && m.game.moveHistory.length === 0, {
      since: undoneMark,
      label: 'undone state at B',
    })
    await a.next((m) => m.t === 'offer-accepted' && m.kind === 'undo', {
      since: acceptedMark,
      label: 'undo acceptance at A',
    })
    console.log('undo applied, history:', undone.game.moveHistory.length)

    // 5. chat
    mark = a.mark()
    b.send({ t: 'chat', text: 'good luck!' })
    const chat = await a.next((m) => m.t === 'chat', { since: mark, label: 'chat at A' })
    assert(chat.from === 1 && chat.text === 'good luck!', 'chat arrived with the wrong author or text')
    console.log('chat:', chat.from, JSON.stringify(chat.text))

    // 6. play two moves, resign, then rematch
    mark = b.mark()
    a.send({ t: 'move', from: { x: 4, y: 6 }, to: { x: 4, y: 4 }, finalTo: { x: 4, y: 4 } })
    await b.next((m) => m.t === 'state' && m.game.moveHistory.length === 1, {
      since: mark,
      label: 'replayed first move at B',
    })

    mark = a.mark()
    b.send({ t: 'move', from: { x: 4, y: 1 }, to: { x: 4, y: 3 }, finalTo: { x: 4, y: 3 } })
    await a.next((m) => m.t === 'state' && m.game.moveHistory.length === 2, {
      since: mark,
      label: 'black reply at A',
    })

    mark = b.mark()
    a.send({ t: 'resign' })
    const resigned = await b.next((m) => m.t === 'state' && m.game.status === 'resign', {
      since: mark,
      label: 'resignation at B',
    })
    assert(resigned.game.winner === classic.teams[1].id, `expected ${classic.teams[1].id} to win, got ${resigned.game.winner}`)
    console.log('resigned, winner:', resigned.game.winner, '| status:', resigned.game.status)

    mark = a.mark()
    b.send({ t: 'offer', kind: 'rematch' })
    await a.next((m) => m.t === 'offer' && m.kind === 'rematch', {
      since: mark,
      label: 'rematch offer at A',
    })

    const rematchMark = b.mark()
    const rematchAcceptedMark = a.mark()
    a.send({ t: 'offer-response', kind: 'rematch', accept: true })
    const rematch = await b.next(
      (m) => m.t === 'state' && m.game.winner === null && m.game.moveHistory.length === 0,
      { since: rematchMark, label: 'fresh rematch state at B' },
    )
    await a.next((m) => m.t === 'offer-accepted' && m.kind === 'rematch', {
      since: rematchAcceptedMark,
      label: 'rematch acceptance at A',
    })
    assert(rematch.clockState, 'rematch did not include clock state')
    console.log('rematch dealt, history:', rematch.game.moveHistory.length, '| clockState:', !!rematch.clockState)
    console.log('ALL OK')
  } catch (error) {
    console.error('FAILED:', error.message)
    if (a) console.error('A log:', summarize(a))
    if (b) console.error('B log:', summarize(b))
    error.roomTestFailed = true
    throw error
  } finally {
    await Promise.allSettled([a?.close(), b?.close()])
  }
}

const classic = (await import('./classic-variant.mjs')).default

let server = null
let failed = false
try {
  server = await startWrangler()
  await runRoomTest()
} catch (error) {
  failed = true
  if (!error.roomTestFailed) console.error(error.message)
} finally {
  try {
    await stopWrangler(server)
  } catch (error) {
    failed = true
    console.error('failed to stop wrangler dev:', error.message)
  }
}

if (failed) process.exitCode = 1
