import { createHash } from 'node:crypto'

const BASE = 'http://127.0.0.1:8787'

function sha256(data) {
  return createHash('sha256').update(data).digest()
}
function leadingZeros(buf) {
  let bits = 0
  for (const b of buf) {
    if (b === 0) { bits += 8; continue }
    bits += Math.clz32(b) - 24
    break
  }
  return bits
}
function solve(salt, bits) {
  for (let nonce = 0; nonce < 5_000_000; nonce++) {
    if (leadingZeros(sha256(`${salt}.${nonce}`)) >= bits) return String(nonce)
  }
  throw new Error('pow failed')
}

function wsUrl(code, token) {
  const url = new URL(`/api/games/${code}/ws`, BASE)
  url.protocol = 'ws:'
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const messages = []
    let waiters = []
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      waiters.forEach((w) => w(msg))
      waiters = []
      messages.push(msg)
    }
    socket.onopen = () => resolve({
      socket,
      messages,
      send: (m) => socket.send(JSON.stringify(m)),
      next: (pred, timeout = 5000) => new Promise((res, rej) => {
        const found = messages.find(pred)
        if (found) return res(found)
        const timer = setTimeout(() => rej(new Error('timeout waiting for message')), timeout)
        waiters.push((msg) => { if (!pred || pred(msg)) { clearTimeout(timer); res(msg) } })
      }),
      close: () => socket.close(),
    })
    socket.onerror = reject
  })
}

const classic = (await import('./classic-variant.mjs')).default

let a = null
let b = null
await (async () => {

// 1. create a room
const ch = await (await fetch(`${BASE}/api/challenge`)).json()
const solution = solve(ch.salt, ch.bits)
const created = await (await fetch(`${BASE}/api/games`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ variant: classic, captcha: { challenge: ch.challenge, solution }, clock: { minutes: 5, increment: 3 } }),
})).json()
console.log('created room:', created.code)
if (!created.code) process.exit(1)

// 2. both seats connect
const a = await connect(wsUrl(created.code, created.token))
const helloA = await a.next((m) => m.t === 'hello')
console.log('A log so far:', a.messages.map((m) => m.t))
console.log('A seat:', helloA.you.seat, '| started:', helloA.started)
await new Promise((r) => setTimeout(r, 400))
const b = await connect(wsUrl(created.code))
const helloB = await b.next((m) => m.t === 'hello')
console.log('B seat:', helloB.you.seat, '| started:', helloB.started, '| history:', helloB.game?.moveHistory.length)
console.log('chat in hello:', helloB.chat)

// The room deals the opening position to whoever was already waiting.
await a.next((m) => m.t === 'state' && !!m.game)
console.log('A got the start state')

// 3. white (seat 0 = A) plays e2-e4
a.send({ t: 'move', from: { x: 4, y: 6 }, to: { x: 4, y: 4 }, finalTo: { x: 4, y: 4 } })
await new Promise((r) => setTimeout(r, 1500))
console.log('A after move:', a.messages.map((m) => m.t + (m.t === 'state' ? ':hist' + m.game.moveHistory.length : '') + (m.t === 'error' ? ':' + m.code : '')))
console.log('B after move:', b.messages.map((m) => m.t + (m.t === 'state' ? ':hist' + m.game.moveHistory.length : '') + (m.t === 'error' ? ':' + m.code : '')))
const stateB = await b.next((m) => m.t === 'state' && m.game.moveHistory.length === 1)
console.log('move played, B sees history:', stateB.game.moveHistory.length)

// 4. undo offer: B offers, A accepts
b.send({ t: 'offer', kind: 'undo' })
const offer = await a.next((m) => m.t === 'offer' && m.kind === 'undo')
console.log('A got offer from seat', offer.seat)
a.send({ t: 'offer-response', kind: 'undo', accept: true })
const undone = await b.next((m) => m.t === 'state' && m.game.moveHistory.length === 0)
console.log('undo applied, history:', undone.game.moveHistory.length)
await new Promise((r) => setTimeout(r, 1500))
console.log('A log after undo:', a.messages.map((m) => m.t + (m.kind ? ':' + m.kind : '')))
await a.next((m) => m.t === 'offer-accepted')

// 5. chat
b.send({ t: 'chat', text: 'good luck!' })
const chat = await a.next((m) => m.t === 'chat')
console.log('chat:', chat.from, JSON.stringify(chat.text))

// 6. play three moves then resign, then rematch
a.send({ t: 'move', from: { x: 4, y: 6 }, to: { x: 4, y: 4 }, finalTo: { x: 4, y: 4 } })
await b.next((m) => m.t === 'state' && m.game.moveHistory.length === 1)
b.send({ t: 'move', from: { x: 4, y: 1 }, to: { x: 4, y: 3 }, finalTo: { x: 4, y: 3 } })
await new Promise((r) => setTimeout(r, 1200))
console.log('B after reply:', b.messages.map((m) => m.t + (m.t === 'error' ? ':' + m.code : '') + (m.t === 'state' ? ':hist' + m.game.moveHistory.length : '')))
await a.next((m) => m.t === 'state' && m.game.moveHistory.length === 2)
a.send({ t: 'resign' })
await new Promise((r) => setTimeout(r, 1200))
console.log('B after resign:', b.messages.map((m) => m.t + (m.t === 'state' ? ':winner=' + m.game.winner : '')))
const resigned = await b.next((m) => m.t === 'state' && m.game.winner !== null)
console.log('resigned, winner:', resigned.game.winner, '| status:', resigned.game.status)

// rematch
b.send({ t: 'offer', kind: 'rematch' })
await a.next((m) => m.t === 'offer' && m.kind === 'rematch')
a.send({ t: 'offer-response', kind: 'rematch', accept: true })
const rematch = await b.next((m) => m.t === 'state' && m.game.winner === null && m.game.moveHistory.length === 0)
console.log('rematch dealt, history:', rematch.game.moveHistory.length, '| clockState:', !!rematch.clockState)

console.log('A log:', a.messages.map((m) => m.t + (m.t === 'state' ? ':' + m.game.moveHistory.length : '')))
console.log('B log:', b.messages.map((m) => m.t + (m.t === 'state' ? ':' + m.game.moveHistory.length : '')))
a.close(); b.close()
console.log('ALL OK')
process.exit(0)
})().catch((error) => {
  console.log('FAILED:', error.message)
  if (a) console.log('A log:', a.messages.map((m) => m.t + (m.t === 'state' ? ':' + m.game.moveHistory.length : '') + (m.t === 'error' ? ':' + m.code : '')))
  if (b) console.log('B log:', b.messages.map((m) => m.t + (m.t === 'state' ? ':' + m.game.moveHistory.length : '') + (m.t === 'error' ? ':' + m.code : '')))
  process.exit(1)
})
