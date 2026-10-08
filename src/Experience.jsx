import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTokens, parseTokens, wireAmount } from './lib/amounts.js'
import { assertCanAfford, jsonGet, PRACTICE_OPPONENT } from './lib/api.js'
import { getCapabilities, registerPatiently, seatHouseRival } from './lib/lobby.js'
import { hasMoveSession, moveSessionAuth, openMoveSession } from './lib/session.js'
import { bestHand } from './lib/pokerEval.js'
import { CENTER, LETTERS, cardProgress, columnNumbers, flattenCard } from './lib/bingoLines.js'
import { PAUSE_MESSAGE, WAGERING_PAUSED } from './lib/safety.js'
import {
  connectFleet,
  disconnectFleet,
  expireRoom,
  getFleetBalance,
  hasFleet,
  joinBingoRound,
  joinDominoTable,
  joinPokerTable,
  placeRouletteBet,
  restoreFleet,
  waitForFleet,
  WALLET_METHOD_MISSING,
} from './lib/fleet'
import {
  createRound,
  entryCost,
  getCard,
  getRoundInfo,
  getRoundProof,
  getRooms,
  openChatSocket,
  openRoundSocket,
  registerRound,
} from './lib/bingo'
import {
  getRouletteProof,
  getRouletteRoundInfo,
  openRouletteRound,
  openRouletteSocket,
  registerRouletteBet,
} from './lib/roulette'
import {
  addDominoOpponent,
  botDominoMove,
  getDominoHand,
  getDominoProof,
  getDominoRound,
  getDominoRoundInfo,
  openDominoRound,
  openDominoSocket,
  postDominoMove,
  registerDominoJoin,
} from './lib/domino'
import {
  addPokerOpponent,
  botPokerAction,
  getPokerHand,
  getPokerProof,
  getPokerRound,
  getPokerRoundInfo,
  openPokerRound,
  openPokerSocket,
  postPokerAction,
  registerPokerJoin,
} from './lib/poker'
import { IconBracket, IconBroadcast, IconChip, IconCoinLoop, IconGithub, IconHome, IconLaurel, IconMilestone, IconShieldCheck, IconSparkle, IconStarBadge } from './lib/icons'
import './experience.css'

const games = [
  { id: 'bingo', name: 'Bingo', category: 'Social', glyph: 'B', live: true, players: 'Table preview', description: 'Preview the community-room interface and its proposed proof flow.' },
  { id: 'poker', name: 'Poker', category: 'Table', glyph: '♠', live: true, players: 'Heads-up preview', description: 'Preview heads-up Hold’em and its replayable betting-action design.' },
  { id: 'domino', name: 'Domino', category: 'Social', glyph: '••', live: true, players: 'Heads-up preview', description: 'Preview two-player block dominoes and its replayable move-log design.' },
  { id: 'pool', name: 'Pool', category: 'Skill', glyph: '8', live: false, players: 'Coming soon', description: 'Head-to-head skill matches with escrowed stakes.' },
  { id: 'roulette', name: 'Roulette', category: 'Table', glyph: '0', live: true, players: 'Wheel preview', description: 'Preview a European single-zero wheel and proposed commit-reveal flow.' },
  { id: 'crash', name: 'Crash', category: 'Originals', glyph: '↗', live: false, players: 'Coming soon', description: 'A fast Canasino Original built around transparent settlement.' },
]

/** @type {[string, typeof IconHome, string][]} */
const nav = [
  ['home', IconHome, 'Casino'],
  ['games', IconChip, 'Games'],
  ['rooms', IconBroadcast, 'Table previews'],
  ['roadmap', IconMilestone, 'Roadmap'],
  ['fairness', IconShieldCheck, 'Provably Fair'],
  ['rewards', IconLaurel, 'Rewards'],
]

const starterMessages = [
  { id: 'system-1', type: 'system', user: 'Canasino', text: 'Room chat remains offline while wagering is paused.' },
]

// The chain accepts MessageExpireRoom (refund) only after the room's real
// on-chain deadline (~720 blocks after it opened). This is a rough client
// hint for when to surface the option -- the chain, not this constant, is
// the actual authority; an early attempt just fails with a clear error.
const EXPIRE_HINT_MS = 60 * 60 * 1000

// Standard European wheel: physical pocket order (not numeric order) and the
// fixed red/black layout -- must match contract/game/roulette.py exactly, or
// the visual wheel would land somewhere the chain never actually paid.
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
const POCKET_ANGLE = 360 / WHEEL_ORDER.length
const WHEEL_GRADIENT = WHEEL_ORDER.map((number, index) => {
  const color = number === 0 ? '#1a5a31' : RED_NUMBERS.has(number) ? '#6e211d' : '#151a17'
  return `${color} ${(index * POCKET_ANGLE).toFixed(3)}deg ${((index + 1) * POCKET_ANGLE).toFixed(3)}deg`
}).join(', ')
// The felt layout reads bottom-to-top in a real table (1 nearest the player);
// each row here is one "column" bet -- row 0 wins col3, row 1 wins col2, row 2 wins col1.
const TABLE_ROWS = [
  { bet: 'col3', numbers: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36] },
  { bet: 'col2', numbers: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35] },
  { bet: 'col1', numbers: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34] },
]
const ROULETTE_BET_LABELS = {
  red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1 – 18', high: '19 – 36',
  dozen1: '1st 12', dozen2: '2nd 12', dozen3: '3rd 12', col1: '2:1', col2: '2:1', col3: '2:1',
}

function colorOf(number) {
  if (number === 0) return 'green'
  return RED_NUMBERS.has(number) ? 'red' : 'black'
}

function betLabel(bet) {
  if (!bet) return ''
  return bet.type === 'straight' ? `Straight ${bet.number}` : ROULETTE_BET_LABELS[bet.type] || bet.type
}

function shortAddress(address = '') {
  if (!address) return 'Guest'
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function cnpy(raw) {
  try { return formatTokens(raw ?? 0) } catch { return 'Unavailable' }
}

// Display-only, 2 decimals (e.g. the win counter) -- never used for amounts that are signed or sent.
function cnpyShort(raw) {
  const cents = Math.round(Number(raw || 0) / 10_000)
  if (!Number.isFinite(cents)) return '—'
  if (cents === 0 && Number(raw) > 0) return trimTokens(raw) // tiny amounts keep their precision rather than rounding to 0
  return (cents / 100).toFixed(2).replace(/\.?0+$/, '') || '0'
}

function timeLabel() {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date())
}

function Logo({ compact = false }) {
  return (
    <div className={`cx-logo ${compact ? 'compact' : ''}`}>
      <span className="cx-logo-mark"><i>C</i></span>
      {!compact && <span><strong>CANASINO</strong><small>PLAY · WIN · ON-CHAIN</small></span>}
    </div>
  )
}

function StatusDot({ online = true }) {
  return <span className={`cx-status-dot ${online ? 'online' : ''}`} />
}

function GameVisual({ game }) {
  return (
    <div className={`cx-game-visual game-${game.id}`} aria-hidden="true">
      <div className="cx-game-grid" />
      <span className="cx-orbit orbit-one" />
      <span className="cx-orbit orbit-two" />
      <span className="cx-game-glyph">{game.glyph}</span>
      {game.id === 'bingo' && <><span className="bingo-ball ball-a">27</span><span className="bingo-ball ball-b">64</span><span className="bingo-ball ball-c">9</span></>}
      {game.id === 'poker' && <><span className="mini-card card-a">A♠</span><span className="mini-card card-b">K♦</span></>}
      {game.id === 'domino' && <span className="domino-tile"><b>•••</b><i /><b>••</b></span>}
      {game.id === 'roulette' && <span className="roulette-wheel"><b>0</b></span>}
    </div>
  )
}

function GameCard({ game, onPlay }) {
  return (
    <article className={`cx-game-card ${game.live ? 'is-live' : ''}`}>
      <GameVisual game={game} />
      <div className="cx-game-card-body">
        <div className="cx-game-card-topline">
          <span>{game.category}</span>
          <span className={game.live ? 'live-label' : 'soon-label'}>{game.live ? <><StatusDot online={!WAGERING_PAUSED} /> {WAGERING_PAUSED ? 'PREVIEW' : 'LIVE'}</> : 'COMING SOON'}</span>
        </div>
        <h3>{game.name}</h3>
        <p>{game.description}</p>
        <div className="cx-game-card-foot">
          <small>{game.players}</small>
          <button className={game.live ? 'cx-icon-button active' : 'cx-icon-button'} disabled={!game.live} onClick={() => game.live && onPlay(game)} aria-label={game.live ? `Explore ${game.name} preview` : `${game.name} coming soon`}>→</button>
        </div>
      </div>
    </article>
  )
}

function WalletButton({ account, balance, onConnect, onDisconnect, connecting }) {
  if (account) {
    return (
      <div className="cx-wallet-connected">
        <button className="cx-balance-button" onClick={onDisconnect} title="Disconnect FleetWallet" aria-label={`Disconnect wallet ${shortAddress(account.address)}`}>
          <span className="wallet-orb" />
          <span><small>{balance?.whole ? `${balance.whole} ${balance.symbol || 'CNPY'}` : 'FleetWallet'}</small><strong>{shortAddress(account.address)}</strong></span>
          <b aria-hidden="true">×</b>
        </button>
      </div>
    )
  }

  return <button className="cx-wallet-button" onClick={onConnect} disabled={connecting}>{connecting ? 'Connecting…' : 'Connect wallet'}</button>
}

function TxStatus({ phase, error, txHash }) {
  const phases = [
    ['idle', 'Choose table'],
    ['round-ready', 'Room ready'],
    ['awaiting-signature', 'Signature'],
    ['submitted', 'Submitted'],
    ['confirmed', 'Confirmed'],
  ]
  const current = phases.findIndex(([id]) => id === phase)

  return (
    <div className="cx-tx-state" aria-live="polite" aria-atomic="true">
      <div className="tx-state-head"><span>{WAGERING_PAUSED ? 'TRANSACTION FLOW · DISABLED' : 'ON-CHAIN ENTRY'}</span>{txHash && <small title={txHash}>{txHash.slice(0, 10)}…</small>}</div>
      <div className="tx-steps">
        {phases.slice(1).map(([id, label], index) => {
          const phaseIndex = index + 1
          const done = current > phaseIndex || phase === 'confirmed'
          const active = current === phaseIndex
          return <span key={id} className={`${done ? 'done' : ''} ${active ? 'active' : ''}`}><i>{done ? '✓' : phaseIndex}</i><small>{label}</small></span>
        })}
      </div>
      {phase === 'awaiting-signature' && <p>Approve the room entry inside FleetWallet. Canasino never receives your private key.</p>}
      {phase === 'submitted' && <p>The signed transaction was submitted. The game server is verifying your on-chain registration.</p>}
      {phase === 'confirmed' && <p className="success-copy">Entry registered by the game service. Follow the table for the result and settlement.</p>}
      {error && <p className="error-copy" role="alert">{error}</p>}
    </div>
  )
}

function BingoCard({ card = [], balls = [], dealing = false, winLine = null, label = '' }) {
  if (!Array.isArray(card) || card.length === 0) {
    return (
      <div className={`cx-card-placeholder ${dealing ? 'is-dealing' : ''}`}>
        <div className="placeholder-grid">{Array.from({ length: 25 }).map((_, index) => <span key={index} />)}</div>
        <strong>{dealing ? 'Dealing your card…' : 'Your card appears after a confirmed entry'}</strong>
        <p>{dealing ? 'Cards come from the final seed, fixed once the entropy window closes.' : 'Numbers come from the game server only after the wallet-signed join is registered.'}</p>
      </div>
    )
  }

  const called = new Set(balls.map((ball) => Number(ball.number ?? ball)))
  const flat = flattenCard(card)
  const { marked, toGo } = cardProgress(flat, called)
  const lastNumber = balls.length ? Number(balls[balls.length - 1].number ?? balls[balls.length - 1]) : null
  const lit = new Set(winLine || [])

  return (
    <div className={`cx-bingo-card ${winLine ? 'is-winner' : ''}`}>
      <div className="bingo-meta">
        {label && <span>{label}</span>}
        <em className={toGo === 0 ? 'is-bingo' : toGo === 1 ? 'is-close' : ''}>{toGo === 0 ? 'Line complete' : `${toGo} to go`}</em>
      </div>
      <div className="bingo-head">{LETTERS.map((letter) => <b key={letter}>{letter}</b>)}</div>
      <div className="bingo-grid">
        {flat.map((number, index) => {
          const free = index === CENTER
          const hit = marked.has(index)
          const cls = [hit ? 'hit' : '', free ? 'free' : '', lit.has(index) ? 'in-line' : '', hit && !free && number === lastNumber ? 'just-called' : ''].filter(Boolean).join(' ')
          return <span role="img" aria-label={free ? 'Free space, marked' : `${number}${hit ? ', marked' : ''}`} className={cls} key={`${number}-${index}`}>{free ? '★' : number}</span>
        })}
      </div>
    </div>
  )
}

// Every number from 1 to 75 in its B-I-N-G-O column, lit as it is called.
function NumberBoard({ balls }) {
  const called = new Set(balls.map((ball) => Number(ball.number)))
  const last = balls.length ? Number(balls[balls.length - 1].number) : null
  return (
    <div className="number-board" role="group" aria-label="Numbers called so far">
      {LETTERS.map((letter, column) => (
        <div className="number-row" key={letter}>
          <b>{letter}</b>
          {columnNumbers(column).map((n) => (
            <span key={n} className={`${called.has(n) ? 'called' : ''} ${n === last ? 'latest' : ''}`} aria-label={`${letter}${n}${called.has(n) ? ', called' : ''}`}>{n}</span>
          ))}
        </div>
      ))}
    </div>
  )
}

// Counts a number up to `target` (easeOutCubic). Used for the win payout so a
// win feels earned; collapses to the final value when motion is reduced.
function useCountUp(target, active, ms = 1100) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active || !Number.isFinite(target)) { setValue(active ? target : 0); return undefined }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setValue(target); return undefined }
    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [target, active, ms])
  return value
}

// Pocket centre sits at index*A + A/2 around the disc; rotating the disc by the
// negative of that puts the winning pocket exactly under the pointer.
const pocketCentre = (number) => WHEEL_ORDER.indexOf(number) * POCKET_ANGLE + POCKET_ANGLE / 2

function RouletteWheel({ spinPhase, spinNumber, revealed = false }) {
  const [rotation, setRotation] = useState(0)
  const [ball, setBall] = useState({ angle: 0, drop: false })
  const motion = useRef({ disc: 0, ball: 0 })

  useEffect(() => {
    if (spinPhase === 'waiting') {
      motion.current = { disc: 0, ball: 0 }
      setRotation(0); setBall({ angle: 0, drop: false })
      return undefined
    }
    if (spinPhase !== 'spinning') return undefined
    let raf
    const tick = () => {
      motion.current.disc += 4.2
      motion.current.ball -= 9.5
      setRotation(motion.current.disc)
      setBall({ angle: motion.current.ball, drop: false })
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [spinPhase])

  useEffect(() => {
    if (spinPhase !== 'settled' || spinNumber == null) return
    // Disc eases to the winning pocket; the ball keeps orbiting the other way,
    // loses speed, then drops onto the pocket a beat after the disc has slowed.
    setRotation(Math.ceil(motion.current.disc / 360) * 360 + 4 * 360 - pocketCentre(spinNumber))
    setBall({ angle: Math.floor(motion.current.ball / 360) * 360 - 3 * 360, drop: true })
  }, [spinPhase, spinNumber])

  const landed = spinPhase === 'settled' && spinNumber != null
  const settled = landed && revealed
  const visible = spinPhase === 'spinning' || landed
  return (
    <div className={`rw-wheel-wrap ${settled ? 'is-settled' : ''} ${spinPhase === 'spinning' || (landed && !revealed) ? 'is-spinning' : ''}`}>
      <span className="rw-pointer" aria-hidden="true" />
      <div className="rw-rim" aria-hidden="true" />
      <div
        className="rw-disc"
        style={{
          background: `conic-gradient(${WHEEL_GRADIENT})`,
          transform: `rotate(${rotation}deg)`,
          transition: landed ? 'transform 4.6s cubic-bezier(.14,.78,.2,1)' : 'none',
        }}
        aria-hidden="true"
      >
        {WHEEL_ORDER.map((number, index) => {
          const angle = index * POCKET_ANGLE + POCKET_ANGLE / 2
          return (
            <span
              className={`rw-pocket-label ${colorOf(number)}`}
              key={number}
              style={{ transform: `rotate(${angle}deg) translateY(calc(var(--rw-disc) * -0.405)) rotate(${-angle}deg)` }}
            >
              {number}
            </span>
          )
        })}
        <span className="rw-disc-ring" />
      </div>
      <span
        className="rw-ball"
        aria-hidden="true"
        style={{
          opacity: visible ? 1 : 0,
          transform: `rotate(${ball.angle}deg) translateY(calc(var(--rw-disc) * ${ball.drop ? -0.448 : -0.472}))`,
          transition: ball.drop ? 'transform 5.4s cubic-bezier(.2,.7,.25,1), opacity .4s' : 'opacity .4s',
        }}
      />
      <div className={`rw-hub ${colorOf(spinNumber ?? -1)} ${settled ? 'has-result' : ''}`}>
        <strong>{settled ? spinNumber : '—'}</strong>
      </div>
    </div>
  )
}

function BettingTable({ selectedBet, onSelect, disabled, chip = null, winning = null }) {
  const isSelected = (type, number) => selectedBet?.type === type && (type !== 'straight' || selectedBet?.number === number)
  const isWinning = (type, number) => {
    if (winning == null) return false
    if (type === 'straight') return number === winning
    if (winning === 0) return false
    const hit = {
      red: RED_NUMBERS.has(winning), black: !RED_NUMBERS.has(winning), odd: winning % 2 === 1, even: winning % 2 === 0,
      low: winning <= 18, high: winning >= 19, dozen1: winning <= 12, dozen2: winning > 12 && winning <= 24, dozen3: winning > 24,
      col1: winning % 3 === 1, col2: winning % 3 === 2, col3: winning % 3 === 0,
    }
    return Boolean(hit[type])
  }
  const cellClass = (type, number) => [
    'rw-cell', type === 'straight' ? (number === 0 ? 'zero' : colorOf(number)) : '',
    isSelected(type, number) ? 'selected' : '', isWinning(type, number) ? 'is-winning' : '',
  ].filter(Boolean).join(' ')
  // A chip rides on whichever cell carries the player's bet: a dashed "ghost"
  // while it is only selected, a solid gold chip once it is locked in.
  const chipOn = (type, number) => {
    const on = chip ? chip.type === type && (type !== 'straight' || chip.number === number)
      : isSelected(type, number)
    if (!on) return null
    return <span className={`rw-chip ${chip ? 'is-locked' : 'is-ghost'}`} aria-hidden="true">{chip ? shortStake(chip.amount) : ''}</span>
  }
  const cell = (type, number, label, extra = {}) => (
    <button type="button" key={`${type}-${number}`} className={`${cellClass(type, number)} ${extra.className || ''}`} aria-label={extra.aria || label}
      aria-pressed={isSelected(type, number)} onClick={() => onSelect(type, number)} disabled={disabled}>
      <span className="rw-cell-label">{label}</span>{chipOn(type, number)}
    </button>
  )

  return (
    <div className={`rw-table ${disabled ? 'is-disabled' : ''}`}>
      <p className="rw-scroll-hint">Swipe horizontally to inspect the full table.</p>
      <div className="rw-felt">
        <div className="rw-grid">
          {cell('straight', 0, '0', { aria: 'Straight 0' })}
          <div className="rw-grid-body">
            {TABLE_ROWS.map((row) => (
              <div className="rw-grid-row" key={row.bet}>
                {row.numbers.map((number) => cell('straight', number, String(number), { aria: `Straight ${number}` }))}
                {cell(row.bet, 0, '2:1', { className: 'rw-col-bet', aria: `Column ${row.bet.slice(-1)}, pays 2 to 1` })}
              </div>
            ))}
          </div>
        </div>
        <div className="rw-outside">
          {cell('dozen1', 0, '1st 12')}{cell('dozen2', 0, '2nd 12')}{cell('dozen3', 0, '3rd 12')}
        </div>
        <div className="rw-outside rw-outside-even">
          {cell('low', 0, '1–18')}{cell('even', 0, 'Even')}
          {cell('red', 0, 'Red', { className: 'red' })}{cell('black', 0, 'Black', { className: 'black' })}
          {cell('odd', 0, 'Odd')}{cell('high', 0, '19–36')}
        </div>
      </div>
    </div>
  )
}

// Compact chip face: 1250000 µCNPY -> "1.3", 25000000 -> "25". The exact amount
// is always shown in the bet panel; the chip only needs to read at a glance.
function shortStake(raw) {
  const whole = Number(raw || 0) / 1_000_000
  if (!Number.isFinite(whole)) return ''
  return whole >= 100 ? String(Math.round(whole)) : whole >= 10 ? String(Math.round(whole)) : String(Math.round(whole * 10) / 10)
}

// Soft gold motes that drift up when the player wins. Positions are fixed
// (index-derived) so renders are stable; CSS handles the motion.
function WinMotes() {
  return (
    <div className="rw-motes" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} style={/** @type {any} */ ({ '--x': `${(i * 37) % 100}%`, '--d': `${(i % 6) * 0.18}s`, '--s': `${0.5 + (i % 4) * 0.22}`, '--r': `${((i * 53) % 40) - 20}px` })} />
      ))}
    </div>
  )
}


const PIP_POSITIONS = {
  0: [],
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}

function DominoPips({ value }) {
  const dots = PIP_POSITIONS[value] || []
  return (
    <div className="dm-pips">
      {Array.from({ length: 9 }).map((_, index) => {
        const row = Math.floor(index / 3)
        const col = index % 3
        const on = dots.some(([r, c]) => r === row && c === col)
        return <span className={on ? 'on' : ''} key={index} />
      })}
    </div>
  )
}

// A bone tile: two halves split by a groove with a brass pin. Size comes from --tw so the
// hand, the chain and the opponent's row can each scale it. A button when clickable.
function DominoTile({ tile = null, faceDown = false, orientation = 'vertical', selected = false, playable = false,
  disabled = false, dim = false, fresh = false, deal = null, onClick = null }) {
  const cls = `dm-tile ${orientation} ${faceDown ? 'face-down' : ''} ${selected ? 'selected' : ''} ${playable ? 'is-playable' : ''} ${dim ? 'is-dim' : ''} ${fresh ? 'is-fresh' : ''} ${deal != null ? 'is-dealt' : ''}`
  const style = deal != null ? /** @type {any} */ ({ '--deal': `${deal}s` }) : undefined
  if (faceDown || !tile) return <div className={cls} style={style} role="img" aria-label="Face-down domino"><span className="dm-back-mark">C</span></div>
  const [low, high] = tile
  const body = <><div className="dm-half"><DominoPips value={low} /></div><i className="dm-groove" /><b className="dm-pin" /><div className="dm-half"><DominoPips value={high} /></div></>
  if (!onClick) return <div className={cls} style={style} role="img" aria-label={`Domino ${low} and ${high}`}>{body}</div>
  return (
    <button type="button" className={cls} style={style} aria-label={`Domino ${low} and ${high}`} aria-pressed={Boolean(selected)} disabled={disabled} onClick={onClick}>
      {body}
    </button>
  )
}

// The open end of the chain. It doubles as the drop target when a tile fits on both sides.
function DominoEnd({ value, side, target = false, onPick = () => {} }) {
  return (
    <button type="button" className={`dm-end ${target ? 'is-target' : ''}`} disabled={!target} onClick={onPick}
      aria-label={target ? `Play on the ${side} end (${value})` : `${side} end shows ${value}`}>
      {value ?? '·'}
    </button>
  )
}

// Keeps the whole chain visible: it shrinks (down to a floor) instead of scrolling away.
function DominoChain({ tiles, ends, targets = [], onPick }) {
  const wrap = useRef(null)
  const line = useRef(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const fit = () => {
      if (!wrap.current || !line.current) return
      const avail = wrap.current.clientWidth - 16
      const need = line.current.scrollWidth
      setScale(need > avail ? Math.max(0.42, avail / need) : 1)
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(fit)
    if (wrap.current) ro.observe(wrap.current)
    if (line.current) ro.observe(line.current)
    return () => ro.disconnect()
  }, [tiles.length])
  return (
    <div className="dm-chain-wrap" ref={wrap}>
      <div className="dm-chain" ref={line} style={{ transform: `scale(${scale})` }}>
        {ends != null && <DominoEnd side="left" value={ends[0]} target={targets.includes('left')} onPick={() => onPick('left')} />}
        <div className="dm-chain-tiles">
          {tiles.map(({ id, tile }, index) => (
            <DominoTile key={id} tile={tile} orientation={tile[0] === tile[1] ? 'vertical' : 'horizontal'} fresh={index === tiles.length - 1} />
          ))}
        </div>
        {ends != null && <DominoEnd side="right" value={ends[1]} target={targets.includes('right')} onPick={() => onPick('right')} />}
      </div>
    </div>
  )
}

// The stock: shows how many tiles are left, and becomes the draw button when you have no play.
function Boneyard({ count, canDraw, canPass, onDraw }) {
  const active = canDraw || canPass
  return (
    <button type="button" className={`dm-boneyard ${active ? 'is-active' : ''}`} disabled={!active} onClick={onDraw}
      aria-label={canDraw ? `Draw a tile (${count} left)` : canPass ? 'Pass' : `${count ?? '—'} tiles in the boneyard`}>
      <span className="dm-stack" aria-hidden="true"><i /><i /><i /></span>
      <span className="dm-boneyard-text"><b>{count ?? '—'}</b><small>{canDraw ? 'Draw' : canPass ? 'Pass' : 'Boneyard'}</small></span>
    </button>
  )
}

const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' }
const SUIT_NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }

// A playing card. The same element serves as a face-down back, a face-up face and
// the flip between them (3D rotate), so a reveal is one class change rather than a swap.
function PlayingCard({ card = null, faceDown = false, dim = false, win = false, deal = null, className = '' }) {
  const down = faceDown || !card
  const [rank, suit] = card || ['', '']
  const red = suit === 'h' || suit === 'd'
  const label = down ? 'Face-down playing card' : `${rank === 'T' ? '10' : rank} of ${SUIT_NAME[suit] || suit}`
  return (
    <div
      className={`pk-card3d ${down ? 'is-down' : ''} ${dim ? 'is-dim' : ''} ${win ? 'is-win' : ''} ${deal != null ? 'is-dealt' : ''} ${className}`}
      style={deal != null ? /** @type {any} */ ({ '--deal': `${deal}s` }) : undefined}
      role="img" aria-label={label}
    >
      <div className={`pk-face pk-front ${red ? 'red' : 'black'}`}>
        <span className="pk-corner"><b>{rank === 'T' ? '10' : rank}</b><i>{SUIT_SYMBOL[suit] || ''}</i></span>
        <span className="pk-pip">{SUIT_SYMBOL[suit] || ''}</span>
      </div>
      <div className="pk-face pk-back"><span>C</span></div>
    </div>
  )
}

// One player's place at the table: hole cards, name plate (stack, dealer button,
// status) and the chips they have in front of them this street.
function TableSeat({ side, name, stack, bet = 0, isTurn = false, isDealer = false, badge = '', winner = false, folded = false, you = false, className = '', children }) {
  return (
    <div className={`pk-seat ${side} ${className} ${isTurn ? 'is-turn' : ''} ${winner ? 'is-winner' : ''} ${folded ? 'is-folded' : ''}`}>
      {bet > 0 && <div className="pk-bet" aria-label={`Bet ${cnpy(bet)} CNPY`}><i className="pk-chip" /><span>{cnpy(bet)}</span></div>}
      <div className="pk-cards">{children}</div>
      <div className="pk-plate">
        <span className="pk-avatar" aria-hidden="true">{you ? 'Y' : 'O'}</span>
        <span className="pk-plate-text"><b>{name}</b><small>{stack}</small></span>
        {isDealer && <span className="pk-dealer" title="Dealer · small blind">D</span>}
        {badge && <span className="pk-badge">{badge}</span>}
      </div>
    </div>
  )
}

function ChatPanel({ messages, value, onChange, onSend, connected, account, canSpeak = false, mobileClose = null, panelId = undefined }) {
  return (
    <aside className="cx-chat-panel" id={panelId}>
      <div className="chat-head">
        <div><StatusDot online={connected} /><span><strong>Room chat</strong><small>{connected ? 'Live channel' : 'Waiting for room'}</small></span></div>
        {mobileClose && <button onClick={mobileClose} aria-label="Close room chat" autoFocus>×</button>}
      </div>
      <div className="chat-messages" role="log" aria-label="Room messages" aria-live="polite">
        {messages.map((message) => (
          <div className={`chat-message ${message.type === 'system' ? 'system' : ''}`} key={message.id}>
            <div><strong>{message.user}</strong><small>{message.time || ''}</small></div>
            <p>{message.text}</p>
          </div>
        ))}
      </div>
      <form className="chat-compose" onSubmit={onSend}>
        <input aria-label="Message the room" value={value} onChange={(event) => onChange(event.target.value)} placeholder={!account ? 'Connect wallet to chat' : canSpeak ? 'Message the room…' : 'Join the table to chat'} disabled={!connected || !canSpeak} maxLength={240} />
        <button disabled={!connected || !canSpeak || !value.trim()} aria-label="Send message">↑</button>
      </form>
    </aside>
  )
}

function MobileChatDialog({ onClose, children }) {
  const dialogRef = useRef(null)
  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={dialogRef} className="mobile-chat-sheet" aria-label="Room chat" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>{children}</dialog>
}

function TableIdentifier({ roundId }) {
  return <label className="table-identifier"><span>Share this full table ID with your opponent</span><input aria-label="Full table ID" readOnly value={roundId || ''} onFocus={(event) => event.target.select()} /></label>
}

function ProofCommitment({ proof }) {
  if (!proof?.commitment) return null
  return <label className="table-identifier"><span>Full commitment · game-service data, not independently verified here</span><input aria-label="Full proof commitment" readOnly value={String(proof.commitment)} onFocus={(event) => event.target.select()} /></label>
}

function LiveRoom({ account, onConnect, walletBalance, refreshBalance = () => {} }) {
  const [rooms, setRooms] = useState([])
  const [roomsState, setRoomsState] = useState('loading')
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [numCards, setNumCards] = useState(1)
  const [round, setRound] = useState(null)
  const [roundInfo, setRoundInfo] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [opening, setOpening] = useState(false)
  const sentJoinRef = useRef(null) // { roundId, hash }: entry tx already on its way for this round
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [cards, setCards] = useState([])
  const [balls, setBalls] = useState([])
  const [proof, setProof] = useState(null)
  const [messages, setMessages] = useState(starterMessages)
  const [chatText, setChatText] = useState('')
  const [chatConnected, setChatConnected] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [result, setResult] = useState(null)
  const [roundCreatedAt, setRoundCreatedAt] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [refundBusy, setRefundBusy] = useState(false)
  const [refundError, setRefundError] = useState('')
  const [refundTxHash, setRefundTxHash] = useState('')
  const chatSocketRef = useRef(null)
  const roundSocketRef = useRef(null)

  useEffect(() => {
    let alive = true
    getRooms()
      .then((data) => {
        if (!alive) return
        setRooms(data)
        setSelectedRoom(data[0] || null)
        setRoomsState('ready')
      })
      .catch((err) => {
        if (!alive) return
        setRoomsState('error')
        setError(`Game preview data unavailable: ${err.message}`)
      })
    return () => { alive = false }
  }, [])

  // The round socket also *drives* the draw (close -> entropy -> balls ->
  // settle), so only open it once this player's entry is confirmed -- opening
  // it at room creation would close betting before anyone joined.
  useEffect(() => {
    if (!round?.roundId || phase !== 'confirmed') return undefined
    const roomId = round.roundId
    let roundWs
    try {
      roundWs = openRoundSocket(roomId)
      roundSocketRef.current = roundWs
      roundWs.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'ball') setBalls((current) => [...current, message])
          if (message.type === 'bingo' || message.type === 'settled') setResult(message)
        } catch {
          // Ignore malformed socket messages instead of breaking the game surface.
        }
      }
    } catch {
      // The room stays usable; the draw is also reachable via the admin path.
    }
    return () => { roundWs?.close(); roundSocketRef.current = null }
  }, [round?.roundId, phase])

  useEffect(() => {
    if (!round?.roundId) return undefined
    const roomId = round.roundId
    let chatWs
    try {
      chatWs = openChatSocket(roomId)
      chatSocketRef.current = chatWs
      chatWs.onopen = () => setChatConnected(true)
      chatWs.onclose = () => setChatConnected(false)
      chatWs.onerror = () => setChatConnected(false)
      chatWs.onmessage = (event) => {
        try {
          const incoming = JSON.parse(event.data)
          if (incoming.type === 'chat_error') {
            setMessages((current) => [...current.slice(-199), { id: crypto.randomUUID(), type: 'system', user: 'Canasino', text: incoming.message || 'Message not sent.' }])
            return
          }
          if (incoming.type !== 'chat') return
          setMessages((current) => [...current.slice(-199), {
            id: crypto.randomUUID(),
            type: 'chat',
            user: incoming.user || 'Player',
            text: incoming.text || '',
            time: timeLabel(),
          }])
        } catch {
          // Ignore malformed chat frames.
        }
      }
    } catch {
      setChatConnected(false)
    }

    getRoundProof(roomId).then(setProof).catch(() => null)

    return () => {
      chatWs?.close()
      chatSocketRef.current = null
    }
  }, [round?.roundId])

  const amount = useMemo(() => entryCost(roundInfo?.entryFee ?? selectedRoom?.entryFee ?? 0, numCards), [roundInfo, selectedRoom, numCards])
  const latestBall = balls[balls.length - 1]
  const settled = result?.type === 'settled'
  const myWon = Boolean(settled && account && result.winners?.some((w) => String(w).toLowerCase() === account.address))
  const myPayout = settled && account ? result.payouts?.[account.address] : null
  const myNet = myPayout != null ? myPayout - amount : null
  const won = myWon // a completed line is a win; whether it nets a profit depends on how full the room was
  const shownNet = useCountUp(myNet != null && myNet > 0 ? myNet : 0, won && myNet != null && myNet > 0)
  // The card whose line completed first, so the win can be shown on the card itself.
  const winningCard = useMemo(() => {
    if (!myWon) return -1
    const drawn = new Set(balls.map((b) => Number(b.number)))
    return cards.findIndex((card) => cardProgress(card, drawn).winningLine)
  }, [myWon, balls, cards])
  const winLine = winningCard >= 0 ? cardProgress(cards[winningCard], new Set(balls.map((b) => Number(b.number)))).winningLine : null
  const drawing = phase === 'confirmed' && balls.length > 0 && !settled

  // Header balance follows the table: after the entry leaves and after the payout lands.
  const refreshRef = useRef(refreshBalance)
  refreshRef.current = refreshBalance
  useEffect(() => { if (phase === 'confirmed' || settled) refreshRef.current() }, [phase, settled])
  const canOfferRefund = round?.roundId && result?.type !== 'settled' && roundCreatedAt
    && (now - roundCreatedAt) >= EXPIRE_HINT_MS

  useEffect(() => {
    if (!round?.roundId || result?.type === 'settled') return undefined
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [round?.roundId, result])

  async function handleExpireRoom() {
    if (!round?.roundId || !roundInfo?.rpcUrl) return
    if (!account) { onConnect(); return }
    setRefundBusy(true); setRefundError(''); setRefundTxHash('')
    try {
      const signed = await expireRoom({
        roundId: round.roundId, rpcUrl: roundInfo.rpcUrl,
        chainId: roundInfo.chainId, networkId: roundInfo.networkId,
      })
      setRefundTxHash(signed?.txHash || '')
      setMessages((current) => [...current, {
        id: `refund-${Date.now()}`, type: 'system', user: 'Canasino',
        text: 'Refund submitted. This is not confirmation: check the transaction in your wallet before retrying.',
      }])
    } catch (err) {
      setRefundError(err?.message || 'The room has not reached its refund deadline yet.')
    } finally {
      setRefundBusy(false)
    }
  }

  async function handleCreateRoom() {
    if (!selectedRoom || opening) return
    setOpening(true)
    setError('')
    setResult(null)
    setBalls([])
    setCards([])
    setProof(null)
    setTxHash('')
    setPhase('idle')
    setRoundCreatedAt(null)
    setRefundError('')
    setRefundTxHash('')

    try {
      const created = await createRound(selectedRoom)
      const roundId = created.roundId || created.round_id
      if (!roundId) throw new Error('Game server returned no round id')
      setRound({ ...created, roundId })
      setRoundCreatedAt(Date.now())
      const info = await getRoundInfo(roundId)
      setRoundInfo({
        entryFee: wireAmount(info.entryFee ?? info.entry_fee ?? selectedRoom.entryFee),
        rakeBps: wireAmount(info.rakeBps ?? info.rake_bps ?? selectedRoom.rakeBps),
        chainId: wireAmount(info.chainId ?? info.chain_id),
        networkId: wireAmount(info.networkId ?? info.network_id),
        rpcUrl: info.rpcUrl ?? info.rpc_url,
      })
      setPhase('round-ready')
      setMessages([{ id: 'created', type: 'system', user: 'Canasino', text: `Live round ${roundId.slice(0, 8)}… created. Chat is now linked to this room.` }])
    } catch (err) {
      setError(err?.status ? err.message : `Could not create the live room: ${err.message}`)
    } finally {
      setOpening(false)
    }
  }

  async function handleJoin() {
    setError('')
    if (!account) {
      onConnect()
      return
    }
    if (!round?.roundId || !roundInfo?.rpcUrl) {
      setError('Create a live room before signing an entry.')
      return
    }

    try {
      let hash
      if (sentJoinRef.current?.roundId === round.roundId) {
        // The entry tx was already sent; only its registration is missing.
        // Sending another would fail on-chain ("player already joined").
        hash = sentJoinRef.current.hash
        setPhase('submitted')
      } else {
        await assertCanAfford(account.address, amount + 10000, 'this room')
        setPhase('awaiting-signature')
        const signed = await joinBingoRound({
          roundId: round.roundId,
          numCards,
          amount,
          rpcUrl: roundInfo.rpcUrl,
          chainId: roundInfo.chainId,
          networkId: roundInfo.networkId,
        })
        hash = signed?.txHash || ''
        sentJoinRef.current = { roundId: round.roundId, hash }
        setTxHash(hash)
        setPhase('submitted')
      }

      // The join tx needs a block to be indexed before the server can verify it;
      // registerPatiently waits and retries while it is still pending (425).
      await registerPatiently(() => registerRound(round.roundId, account.address, numCards, hash))
      // One signature lets this player read their own card for this room.
      await openMoveSession('bingo', round.roundId, account)
      setPhase('confirmed')
      getRoundProof(round.roundId).then(setProof).catch(() => null)

      // Cards are dealt from the FINAL seed (revealed secret folded with the
      // consensus entropy fixed at close), so they only exist once the round
      // has closed and its entropy window has finalized -- and the draw holds
      // the manager lock through that wait, so a fetch here can 425 OR time
      // out. Either way, keep polling.
      for (let attempt = 0; attempt < 60; attempt++) {
        try {
          const cardResponse = await getCard(round.roundId, account.address, numCards)
          if (Array.isArray(cardResponse.cards) && cardResponse.cards.length) {
            setCards(cardResponse.cards)
            break
          }
        } catch { /* 425 or timeout while the entropy window finalizes */ }
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    } catch (err) {
      if (err?.code === WALLET_METHOD_MISSING || err?.message === WALLET_METHOD_MISSING) {
        setError('This FleetWallet build does not expose canopy_signAndSubmit yet. Update FleetWallet before playing with real value.')
      } else {
        setError(err?.message || 'The room entry failed.')
      }
      // The chain rejected that tx for good: forget it so the next press sends a fresh one.
      if (err?.status === 422) sentJoinRef.current = null
      setPhase('round-ready')
    }
  }

  // Only players who paid into this table may speak: each message is MAC'd with the table
  // session (the server also checks the address is seated), so it cannot be forged.
  const canSpeak = Boolean(account && round?.roundId && hasMoveSession(round.roundId))

  async function sendChat(event) {
    event.preventDefault()
    const text = chatText.trim()
    if (!text || !account || !chatConnected || chatSocketRef.current?.readyState !== WebSocket.OPEN) return
    const address = account.address.toLowerCase()
    const ts = Date.now()
    const auth = await moveSessionAuth(round.roundId, { address, round_id: round.roundId, read: 'chat', text, ts })
    if (!auth) {
      setMessages((current) => [...current.slice(-199), { id: crypto.randomUUID(), type: 'system', user: 'Canasino', text: 'Join the table to chat.' }])
      return
    }
    chatSocketRef.current.send(JSON.stringify({ type: 'chat', text, address, ts, session_id: auth.sessionId, mac: auth.mac }))
    setChatText('')
  }

  return (
    <section className="cx-live-room" id="rooms">
      <div className="room-ambient ambient-one" />
      <div className="room-ambient ambient-two" />

      <div className="cx-room-main">
        <div className="cx-room-heading">
          <div>
            <span className="cx-eyebrow"><StatusDot online={!WAGERING_PAUSED} /> BINGO · {WAGERING_PAUSED ? 'READ-ONLY PREVIEW' : 'LIVE ROOM'}</span>
            <h1>Explore the <em>gold room.</em></h1>
            <p>{WAGERING_PAUSED ? 'Inspect the table and wallet flow. Creating rounds, signing entries and live chat remain disabled during the security review.' : 'Seventy-five balls, one seed committed before anyone joins. The first completed line takes the pot.'}</p>
          </div>
        </div>

        <div className="cx-room-layout">
          <div className={`cx-game-stage bg-stage ${won ? 'is-win' : ''}`}>
            {won && <WinMotes />}
            <div className="stage-topbar">
              <div><span className="table-badge"><StatusDot online={!WAGERING_PAUSED} /> {WAGERING_PAUSED ? 'PREVIEW TABLE' : 'LIVE TABLE'}</span><strong>{selectedRoom?.name || 'Bingo room'}</strong></div>
              <button className="mobile-chat-toggle" aria-expanded={chatOpen} aria-controls="mobile-room-chat" onClick={() => setChatOpen(true)}>Chat <span>{messages.filter((m) => m.type !== 'system').length}</span></button>
            </div>

            <div className="ball-stage">
              <div className={`draw-machine ${latestBall ? 'has-ball' : ''} ${drawing ? 'is-drawing' : ''}`}>
                <span className="machine-ring ring-1" />
                <span className="machine-ring ring-2" />
                <div className="draw-ball" key={latestBall ? latestBall.number : 'idle'}>
                  {latestBall ? <><small>{latestBall.letter || ''}</small><strong>{latestBall.number}</strong></> : <><small>ROUND</small><strong>{round ? 'DATA' : '—'}</strong></>}
                </div>
              </div>
              <div className="draw-copy">
                <span className="cx-eyebrow">{settled ? 'FINAL BALL' : 'CURRENT DRAW'}</span>
                <h2>{latestBall ? `${latestBall.letter || ''}${latestBall.number}` : round ? 'Waiting for draw' : 'Create a room'}</h2>
                <p>{round ? (balls.length ? `${balls.length} of 75 called` : 'The draw starts once your entry is confirmed.') : 'Select a room below to inspect its preview.'}</p>
                <div className="draw-progress" aria-hidden="true"><span style={{ width: `${(balls.length / 75) * 100}%` }} /></div>
                <div className="recent-balls">
                  {balls.slice(-8).reverse().map((ball, index) => <span className={index === 0 ? 'latest' : ''} key={`${ball.index ?? index}-${ball.number}`}>{ball.letter}{ball.number}</span>)}
                  {balls.length === 0 && Array.from({ length: 5 }).map((_, index) => <span className="ghost" key={index}>•</span>)}
                </div>
              </div>
              <NumberBoard balls={balls} />
            </div>

            <div className="player-surface">
              <div className="card-area">
                <div className="surface-title"><span><small>YOUR CARD</small><strong>{account ? shortAddress(account.address) : 'Wallet not connected'}</strong></span>{cards.length > 1 && <b>{cards.length} cards</b>}</div>
                {cards.length
                  ? <div className="cards-grid">{cards.map((card, index) => (
                    <div className="bingo-card-entry" key={index}>
                      <BingoCard card={card} balls={balls} label={cards.length > 1 ? `Card ${index + 1}` : ''} winLine={index === winningCard ? winLine : null} />
                    </div>
                  ))}</div>
                  : <BingoCard balls={balls} dealing={phase === 'confirmed'} />}
              </div>
              <div className="round-side">
                <TxStatus phase={phase} error={error} txHash={txHash} />
                {settled && (
                  <div className={`result-card ${won ? 'is-win' : ''}`}>
                    <span className="cx-eyebrow">ROUND RESULT</span>
                    <strong>{won ? 'Bingo! You won' : 'Round settled'}</strong>
                    {won && myNet != null && (myNet > 0
                      ? <span className="rw-win-amount">+{cnpyShort(shownNet)} <small>CNPY</small></span>
                      : <span className="rw-win-amount">{cnpyShort(myPayout)} <small>CNPY PAID</small></span>)}
                    <p>{Array.isArray(result.winners) && result.winners.length ? `${result.winners.length} winner${result.winners.length > 1 ? 's' : ''} on ball ${result.balls ?? balls.length}.` : 'Settlement reported by the game service.'}{won ? (myNet != null && myNet > 0 ? ' Profit after rake, paid on-chain.' : ' Paid on-chain, after rake.') : ''}</p>
                  </div>
                )}
                {canOfferRefund && !refundTxHash && (
                  <div className="refund-card">
                    <span className="cx-eyebrow">ROOM TAKING TOO LONG?</span>
                    <p>If this room never settles, anyone can trigger an on-chain refund of every escrowed entry once the room passes its expiry window.</p>
                    <button className="refund-button" onClick={handleExpireRoom} disabled={refundBusy}>
                      {refundBusy ? 'Requesting refund…' : account ? 'Claim refund' : 'Connect wallet to claim'}
                    </button>
                    {refundError && <p className="error-copy">{refundError}</p>}
                  </div>
                )}
                {refundTxHash && (
                  <div className="refund-card">
                    <span className="cx-eyebrow">REFUND SUBMITTED</span>
                    <p>Escrowed entries for this room are being returned on-chain.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <ChatPanel messages={messages} value={chatText} onChange={setChatText} onSend={sendChat} connected={chatConnected} account={account} canSpeak={canSpeak} />
        </div>

        <div className="cx-room-controls">
          <div className="control-section room-picker">
            <span className="control-label">01 · CHOOSE TABLE</span>
            <div className="room-options">
              {roomsState === 'loading' && <span className="room-loading">Loading read-only room templates…</span>}
              {rooms.map((room) => (
                <button key={room.id} className={selectedRoom?.id === room.id ? 'active' : ''} onClick={() => { setSelectedRoom(room); setRound(null); setRoundInfo(null); setPhase('idle'); setError('') }}>
                  <span>{room.emoji}</span><div><strong>{room.name}</strong><small>{cnpy(room.entryFee)} CNPY · {room.capacity || '—'} seats</small></div><i>✓</i>
                </button>
              ))}
            </div>
          </div>

          <div className="control-section card-picker">
            <span className="control-label">02 · CARDS</span>
            <div className="counter-control">
              <button aria-label="Fewer Bingo cards" onClick={() => setNumCards((value) => Math.max(1, value - 1))}>−</button>
              <span><strong>{numCards}</strong><small>{numCards === 1 ? 'card' : 'cards'}</small></span>
              <button aria-label="More Bingo cards" onClick={() => setNumCards((value) => Math.min(4, value + 1))}>+</button>
            </div>
            <small className="cost-note">Entry · {cnpy(amount)} CNPY</small>
          </div>

          <div className="control-section action-control">
            <span className="control-label">03 · WAGERING</span>
            {!round ? (
              <button className="cx-gold-button" onClick={handleCreateRoom} disabled={WAGERING_PAUSED || opening || !selectedRoom || roomsState !== 'ready'} aria-busy={opening}><span>{WAGERING_PAUSED ? 'Unavailable during audit' : opening ? 'Opening table…' : 'Open table'}</span><b>→</b></button>
            ) : phase === 'confirmed' ? (
              <button className="cx-confirmed-button" disabled><span>Entry registered</span><b>✓</b></button>
            ) : (
              <button className="cx-gold-button" onClick={handleJoin} disabled={WAGERING_PAUSED || phase === 'awaiting-signature' || phase === 'submitted'}><span>{account ? 'Sign & join room' : 'Connect FleetWallet'}</span><b>→</b></button>
            )}
            <small>{walletBalance?.whole ? `Available · ${walletBalance.whole} ${walletBalance.symbol || 'CNPY'}` : 'Self-custody · approval required'}</small>
          </div>
        </div>

        <div className="cx-proof-strip">
          <div><span className="proof-icon" aria-hidden="true">◇</span><span><small>ROUND PROOF DATA</small><strong>{proof?.commitment ? `${String(proof.commitment).slice(0, 18)}…` : 'Proof appears with the round'}</strong></span></div>
          <div><small>ROUND</small><strong>{round?.roundId ? `${round.roundId.slice(0, 12)}…` : '—'}</strong></div>
          <div><small>CHAIN</small><strong>{roundInfo?.chainId || 'Dynamic'}</strong></div>
          <div><small>RAKE</small><strong>{selectedRoom?.rakeBps ? `${selectedRoom.rakeBps / 100}%` : '—'}</strong></div>
          <button onClick={() => round?.roundId && getRoundProof(round.roundId).then(setProof).catch(() => null)} disabled={!round}>Refresh proof</button>
        </div>
        <ProofCommitment proof={proof} />
      </div>

      {chatOpen && <MobileChatDialog onClose={() => setChatOpen(false)}><ChatPanel panelId="mobile-room-chat" messages={messages} value={chatText} onChange={setChatText} onSend={sendChat} connected={chatConnected} account={account} canSpeak={canSpeak} mobileClose={() => setChatOpen(false)} /></MobileChatDialog>}
    </section>
  )
}

// Backend note: each round is opened fresh on request (no shared, continuously-
// spinning table yet -- see the roadmap memory on this trade-off). This
// component papers over that by auto-opening the next round a few seconds
// after each settle, so the table reads as "always live" from the player's
// side without needing a backend change.
const ROULETTE_AUTO_RESPIN_MS = 7_000
// Time for the disc + ball animation to land before the result is revealed in text.
const ROULETTE_REVEAL_MS = 5_000

const BET_CUTOFF_SECONDS = 12

function RouletteRoom({ account, onConnect, walletBalance, refreshBalance = () => {} }) {
  const [roundId, setRoundId] = useState(null)
  const [, setRoundMeta] = useState(null)
  const [roundInfo, setRoundInfo] = useState(null)
  const [openError, setOpenError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(null)
  const [windowTotal, setWindowTotal] = useState(0)
  const [spinPhase, setSpinPhase] = useState('waiting')
  const [spinResult, setSpinResult] = useState(null)
  const [proof, setProof] = useState(null)
  const [selectedBet, setSelectedBet] = useState(null)
  const [betAmount, setBetAmount] = useState('5')
  const [myBet, setMyBet] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
  const socketRef = useRef(null)
  const respinTimerRef = useRef(null)
  const revealTimerRef = useRef(null)
  const [revealed, setRevealed] = useState(false)

  async function startNewRound() {
    window.clearTimeout(revealTimerRef.current)
    setRevealed(false)
    setRoundId(null)
    setOpenError('')
    setSpinPhase('waiting')
    setSpinResult(null)
    setProof(null)
    setSelectedBet(null)
    setMyBet(null)
    setPhase('idle')
    setError('')
    setTxHash('')
    setSecondsLeft(null)
    setWindowTotal(0)

    try {
      const created = await openRouletteRound()
      const id = created.roundId
      const info = await getRouletteRoundInfo(id)
      setRoundMeta(created)
      setRoundInfo({
        rakeBps: wireAmount(info.rakeBps ?? created.rakeBps ?? 0),
        minBet: wireAmount(info.minBet ?? created.minBet ?? 0),
        maxBet: wireAmount(info.maxBet ?? created.maxBet ?? 0),
        chainId: wireAmount(info.chainId),
        networkId: wireAmount(info.networkId),
        rpcUrl: info.rpcUrl,
      })
      setBetAmount(formatTokens(info.minBet ?? created.minBet ?? 1_000_000))
      setPhase('round-ready')
      setRoundId(id)
    } catch (err) {
      setOpenError(`Could not open a new wheel: ${err.message}`)
    }
  }

  useEffect(() => {
    if (!WAGERING_PAUSED) startNewRound()
    return () => { window.clearTimeout(respinTimerRef.current); window.clearTimeout(revealTimerRef.current) }
  }, [])

  useEffect(() => {
    if (!roundId) return undefined
    let ws
    try {
      ws = openRouletteSocket(roundId)
      socketRef.current = ws
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'tick') { setSecondsLeft(message.secondsLeft); setWindowTotal((total) => Math.max(total, message.secondsLeft)) }
          if (message.type === 'spinning') { setSecondsLeft(0); setSpinPhase('spinning') }
          if (message.type === 'settled') {
            setSpinPhase('settled')
            setSpinResult(message)
            getRouletteProof(roundId).then(setProof).catch(() => null)
            const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            revealTimerRef.current = window.setTimeout(() => setRevealed(true), reduced ? 0 : ROULETTE_REVEAL_MS)
            respinTimerRef.current = window.setTimeout(startNewRound, ROULETTE_AUTO_RESPIN_MS + ROULETTE_REVEAL_MS)
          }
          if (message.type === 'error') setOpenError(message.message || 'The wheel connection was lost.')
        } catch {
          // Ignore malformed socket frames.
        }
      }
    } catch {
      setOpenError('Could not connect to the wheel socket.')
    }

    getRouletteProof(roundId).then(setProof).catch(() => null)

    return () => { ws?.close(); socketRef.current = null }
  }, [roundId])

  // A bet is a chain tx (~10 s); one signed in the last seconds lands after the server closes the window.
  const betsOpen = phase !== 'idle' && spinPhase === 'waiting' && (secondsLeft == null || secondsLeft > BET_CUTOFF_SECONDS)
  const minBetWhole = roundInfo?.minBet ? roundInfo.minBet / 1_000_000 : 0
  const maxBetWhole = roundInfo?.maxBet ? roundInfo.maxBet / 1_000_000 : 0

  async function handlePlaceBet() {
    setError('')
    if (!account) { onConnect(); return }
    if (!selectedBet) { setError('Choose a bet on the table first.'); return }
    if (!roundId || !roundInfo?.rpcUrl) { setError('Waiting for the wheel to open.'); return }
    let amount
    try { amount = parseTokens(betAmount) } catch (err) { setError(err.message); return }
    if (!Number.isFinite(amount) || amount < roundInfo.minBet || amount > roundInfo.maxBet) {
      setError(`Bet must be between ${minBetWhole} and ${maxBetWhole} CNPY.`)
      return
    }

    try {
      await assertCanAfford(account.address, amount + 10000, 'this bet')
      setPhase('awaiting-signature')
      const signed = await placeRouletteBet({
        roundId, betType: selectedBet.type, betNumber: selectedBet.number || 0, amount,
        rpcUrl: roundInfo.rpcUrl, chainId: roundInfo.chainId, networkId: roundInfo.networkId,
      })
      setTxHash(signed?.txHash || '')
      setPhase('submitted')
      // The bet tx needs a block to be indexed before the server can verify
      // it; give it a moment, then retry once on 425.
      await registerPatiently(() => registerRouletteBet(roundId, account.address, selectedBet.type, selectedBet.number || 0, amount, signed?.txHash))
      setMyBet({ ...selectedBet, amount })
      setPhase('confirmed')
    } catch (err) {
      if (err?.code === WALLET_METHOD_MISSING || err?.message === WALLET_METHOD_MISSING) {
        setError('This FleetWallet build does not expose canopy_signAndSubmit for roulette_bet yet. Update FleetWallet before playing with real value.')
      } else {
        setError(err?.message || 'The bet was not accepted.')
      }
      setPhase('round-ready')
    }
  }

  const myPayout = spinResult && myBet ? spinResult.payouts?.[account?.address] : null
  const won = revealed && myPayout != null && myPayout > 0
  const shownPayout = useCountUp(myPayout ?? 0, won)
  const settledNow = spinPhase === 'settled' && spinResult && revealed
  // The wallet balance in the header follows the table: after the stake leaves and after the payout lands.
  const resultShown = Boolean(settledNow)
  const refreshRef = useRef(refreshBalance)
  refreshRef.current = refreshBalance
  useEffect(() => { if (phase === 'confirmed' || resultShown) refreshRef.current() }, [phase, resultShown])
  const countdownPct = windowTotal > 0 && secondsLeft != null ? Math.max(0, Math.min(100, (secondsLeft / windowTotal) * 100)) : 0

  return (
    <section className="cx-live-room rw-room" id="rooms">
      <div className="room-ambient ambient-one" />
      <div className="room-ambient ambient-two" />

      <div className="cx-room-main">
        <div className="cx-room-heading">
          <div>
            <span className="cx-eyebrow"><StatusDot online={!WAGERING_PAUSED} /> ROULETTE · {WAGERING_PAUSED ? 'READ-ONLY PREVIEW' : 'LIVE TABLE'}</span>
            <h1>Spin the <em>wheel.</em></h1>
            <p>European single-zero wheel. The operator commits to a hidden seed before the table opens; the spin is derived from it and only revealed at settle.</p>
          </div>
        </div>

        <div className="cx-room-layout rw-layout">
          <div className={`cx-game-stage rw-stage ${spinPhase === 'spinning' ? 'is-spinning' : ''} ${settledNow ? 'is-settled' : ''} ${won ? 'is-win' : ''}`}>
            {won && <WinMotes />}
            <div className="rw-stage-top">
              <RouletteWheel spinPhase={spinPhase} spinNumber={spinResult?.spin} revealed={revealed} />
              <div className="rw-status-copy">
                <span className="cx-eyebrow">
                  {WAGERING_PAUSED ? 'TABLE PREVIEW' : spinPhase === 'spinning' || (spinPhase === 'settled' && !revealed) ? 'NO MORE BETS' : settledNow ? 'RESULT' : roundId ? 'BETS OPEN' : 'OPENING'}
                </span>
                <h2 className={settledNow ? `rw-result ${colorOf(spinResult.spin)}` : ''}>
                  {WAGERING_PAUSED ? 'Wagering paused' : settledNow
                    ? <><b className="rw-result-num">{spinResult.spin}</b> {spinResult.color}</>
                    : spinPhase === 'spinning' || spinPhase === 'settled'
                    ? 'The wheel is spinning'
                    : secondsLeft != null ? <><b className="rw-count">{secondsLeft}</b><span className="rw-count-unit">s to bet</span></> : 'Opening the table…'}
                </h2>
                <p>
                  {WAGERING_PAUSED ? 'Explore the wheel layout. No round or transaction will be created.' : settledNow
                    ? 'A new wheel opens in a few seconds. The proof is below.'
                    : spinPhase === 'spinning' || spinPhase === 'settled'
                    ? 'The result comes from the seed committed before betting opened.'
                    : myBet
                    ? `Your bet: ${betLabel(myBet)} · ${cnpy(myBet.amount)} CNPY`
                    : 'Pick a number or an outside bet, then place it before the countdown ends.'}
                </p>
                {!WAGERING_PAUSED && spinPhase === 'waiting' && roundId && (
                  <div className="rw-countdown" role="progressbar" aria-label="Time left to bet" aria-valuemin={0} aria-valuemax={windowTotal || 1} aria-valuenow={secondsLeft ?? 0}>
                    <span style={{ width: `${countdownPct}%` }} />
                  </div>
                )}
                {openError && <p className="error-copy">{openError}</p>}
              </div>
            </div>

            <BettingTable selectedBet={selectedBet} chip={myBet} winning={settledNow ? spinResult.spin : null} onSelect={(type, number = 0) => betsOpen && !myBet && setSelectedBet({ type, number })} disabled={!betsOpen || Boolean(myBet)} />

            <div className="rw-bet-controls">
              <div className="control-section rw-selected-bet">
                <span className="control-label">01 · YOUR BET</span>
                <strong>{selectedBet ? betLabel(selectedBet) : 'None selected'}</strong>
                <small>{roundInfo ? `${minBetWhole} – ${maxBetWhole} CNPY per bet` : 'Limits unavailable while wagering is paused.'}</small>
              </div>
              <div className="control-section rw-amount">
                <span className="control-label">02 · AMOUNT (CNPY)</span>
                <input aria-label="Roulette wager in CNPY"
                  type="number" min={minBetWhole || 1} max={maxBetWhole || undefined} step="1"
                  value={betAmount} onChange={(event) => setBetAmount(event.target.value)}
                  disabled={!betsOpen || Boolean(myBet)}
                />
              </div>
              <div className="control-section action-control">
                <span className="control-label">03 · PLACE BET</span>
                {myBet ? (
                  <button className="cx-confirmed-button" disabled><span>Bet locked in</span><b>✓</b></button>
                ) : (
                  <button className="cx-gold-button" onClick={handlePlaceBet} disabled={WAGERING_PAUSED || !betsOpen || phase === 'awaiting-signature' || phase === 'submitted'}>
                    <span>{WAGERING_PAUSED ? 'Unavailable during audit' : account ? 'Sign & place bet' : 'Connect FleetWallet'}</span><b>→</b>
                  </button>
                )}
                <small>{walletBalance?.whole ? `Available · ${walletBalance.whole} ${walletBalance.symbol || 'CNPY'}` : 'Self-custody · approval required'}</small>
              </div>
            </div>
          </div>

          <div className="round-side rw-side">
            <TxStatus phase={phase} error={error} txHash={txHash} />
            {settledNow && myBet && (
              <div className={`result-card ${won ? 'is-win' : ''}`}>
                <span className="cx-eyebrow">ROUND RESULT</span>
                <strong>{won ? 'You won' : 'No luck this spin'}</strong>
                {won && <span className="rw-win-amount">+{cnpyShort(shownPayout)} <small>CNPY</small></span>}
                <p>
                  {spinResult.spin} {spinResult.color} · {won
                    ? 'Paid out on-chain, net of rake.'
                    : `Your ${betLabel(myBet)} bet did not match.`}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="cx-proof-strip">
          <div><span className="proof-icon" aria-hidden="true">◇</span><span><small>ROUND PROOF DATA</small><strong>{proof?.commitment ? `${String(proof.commitment).slice(0, 18)}…` : 'Proof appears with the round'}</strong></span></div>
          <div><small>ROUND</small><strong>{roundId ? `${roundId.slice(0, 12)}…` : '—'}</strong></div>
          <div><small>CHAIN</small><strong>{roundInfo?.chainId || 'Dynamic'}</strong></div>
          <div><small>RAKE</small><strong>{roundInfo?.rakeBps ? `${roundInfo.rakeBps / 100}%` : '—'}</strong></div>
          <button onClick={() => roundId && getRouletteProof(roundId).then(setProof).catch(() => null)} disabled={!roundId}>Refresh proof</button>
        </div>
        <ProofCommitment proof={proof} />
        {proof?.seed && <p className="rw-seed-reveal">Seed revealed: <code>{proof.seed}</code>. Verification requires the exact commitment encoding and outcome algorithm used by the chain.</p>}
      </div>
    </section>
  )
}

// Rebuild the line of tiles on the table (visual left-to-right) from the
// public move log. Each tile is oriented [innerPipTowardLeftEnd, ...] so the
// numbers read continuously along the chain.
function reconstructDominoBoard(moves) {
  const tiles = []
  let n = 0
  let left = null
  let right = null
  for (const move of moves || []) {
    if (move.action !== 'play' || !Array.isArray(move.tile)) continue
    const [a, b] = move.tile
    if (tiles.length === 0) {
      tiles.push({ id: `m${n}`, tile: [a, b] })
      left = a
      right = b
      n += 1
      continue
    }
    if (move.end === 'left') {
      const outer = a === left ? b : a
      tiles.unshift({ id: `m${n}`, tile: [outer, left] })
      left = outer
    } else {
      const outer = a === right ? b : a
      tiles.push({ id: `m${n}`, tile: [right, outer] })
      right = outer
    }
    n += 1
  }
  return tiles
}

function legalDominoEnds(tile, ends) {
  if (!ends) return ['none']
  const [left, right] = ends
  const [a, b] = tile
  const outs = []
  if (a === left || b === left) outs.push('left')
  if (a === right || b === right) outs.push('right')
  return outs
}

function DominoRoom({ account, onConnect, refreshBalance = () => {} }) {
  const [mode, setMode] = useState('lobby') // lobby -> waiting -> playing -> settled
  const [roundId, setRoundId] = useState(null)
  const [roundInfo, setRoundInfo] = useState(null)
  const [mySeat, setMySeat] = useState(null)
  const [, setPlayers] = useState([])
  const [botAddress, setBotAddress] = useState(null)
  const [myHand, setMyHand] = useState([])
  const [ends, setEnds] = useState(null)
  const [boardTiles, setBoardTiles] = useState([])
  const [turn, setTurn] = useState(null)
  const [boneyardRemaining, setBoneyardRemaining] = useState(null)
  const [handSizes, setHandSizes] = useState([7, 7])
  const [houseRival, setHouseRival] = useState(false) // devnet: the service can seat the house as your opponent
  const [houseSeated, setHouseSeated] = useState(false)
  const [showStep, setShowStep] = useState(0) // 0 last tile just landed -> 1 result announced
  const [joinInput, setJoinInput] = useState('')
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [selectedTile, setSelectedTile] = useState(null)
  const [result, setResult] = useState(null)
  const [proof, setProof] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    let alive = true
    getCapabilities().then((c) => { if (alive) setHouseRival(Boolean(c?.houseRival)) }).catch(() => null)
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (mode !== 'waiting' || !roundId) return undefined
    const id = window.setInterval(() => {
      getDominoRound(roundId).then((status) => {
        if (status.players.length === 2) {
          setPlayers(status.players)
          setMode('playing')
        }
      }).catch(() => null)
    }, 2000)
    return () => window.clearInterval(id)
  }, [mode, roundId])

  // The game WS is operator-gated, so a browser can't subscribe to it (403).
  // Poll the round for turn/ends/boneyard and settlement while a table is live.
  useEffect(() => {
    if (mode !== 'playing' || !roundId) return undefined
    const id = window.setInterval(() => {
      getDominoRound(roundId).then((status) => {
        if (status.turn != null) setTurn(status.turn)
        if (status.ends !== undefined) setEnds(status.ends ?? null)
        if (status.boneyardRemaining != null) setBoneyardRemaining(status.boneyardRemaining)
        if (Array.isArray(status.handSizes)) setHandSizes(status.handSizes)
        if (Array.isArray(status.moves)) setBoardTiles(reconstructDominoBoard(status.moves))
        if (status.status === 'settled') {
          // submitMove / the bot effect carry the rich settle result (address
          // payouts); this only flips the view if that response was lost.
          getDominoProof(roundId).then((p) => {
            setProof(p)
            if (Array.isArray(p.moves)) setBoardTiles(reconstructDominoBoard(p.moves))
            setResult((prev) => prev || {
              winners: (p.winners || []).map((s) => status.players?.[s]).filter(Boolean),
              reason: p.reason, payouts: {},
            })
          }).catch(() => null)
          setMode('settled')
        }
      }).catch(() => null)
    }, 2000)
    return () => window.clearInterval(id)
  }, [mode, roundId])

  // The table creator (seat 0) joins before an opponent exists, so their hand
  // is not dealt until the second player triggers prepare_outcome. Fetch it
  // once the table is live, retrying while the entropy window finalizes -- the
  // 2nd join holds the manager lock through that wait, so a fetch here can 425
  // OR time out; either way, keep trying.
  useEffect(() => {
    if (mode !== 'playing' || !roundId || !account || myHand.length > 0) return undefined
    let cancelled = false
    ;(async () => {
      for (let attempt = 0; attempt < 60 && !cancelled; attempt++) {
        try {
          const hand = await getDominoHand(roundId, account.address)
          if (Array.isArray(hand.hand) && hand.hand.length > 0) { if (!cancelled) setMyHand(hand.hand); return }
        } catch { /* 425 or timeout while the entropy window finalizes */ }
        await new Promise((r) => setTimeout(r, 3000))
      }
    })()
    return () => { cancelled = true }
  }, [mode, roundId, account, myHand.length])

  // Practice opponent: when it is the bot's turn, play the first legal tile,
  // drawing/passing as the rules require. Local valueless stacks only.
  const botBusy = useRef(false)
  useEffect(() => {
    if (mode !== 'playing' || !roundId || !botAddress) return undefined
    if (turn == null || turn === mySeat || botBusy.current) return undefined
    botBusy.current = true
    let cancelled = false
    ;(async () => {
      try {
        await new Promise((r) => setTimeout(r, 700))
        let boneyard = boneyardRemaining ?? 0
        for (let guard = 0; guard < 30 && !cancelled; guard++) {
          let hand
          try { ({ hand } = await getDominoHand(roundId, botAddress, { operator: true })) }
          catch { await new Promise((r) => setTimeout(r, 2000)); continue }
          const playable = hand.find((tile) => (ends == null) || legalDominoEnds(tile, ends).length > 0)
          let resp
          if (playable) {
            const outs = ends == null ? ['none'] : legalDominoEnds(playable, ends)
            resp = await botDominoMove(roundId, botAddress, 'play', playable, outs[0] === 'none' ? undefined : outs[0])
          } else if (boneyard > 0) {
            await botDominoMove(roundId, botAddress, 'draw')
            boneyard -= 1
            continue
          } else {
            resp = await botDominoMove(roundId, botAddress, 'pass')
          }
          if (resp?.settled && !cancelled) {
            setResult(resp.settled)
            setMode('settled')
            getDominoProof(roundId).then(setProof).catch(() => null)
          }
          return
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'The practice opponent could not move.')
      } finally {
        botBusy.current = false
      }
    })()
    return () => { cancelled = true; botBusy.current = false }
  }, [mode, roundId, botAddress, turn, mySeat, ends, boneyardRemaining])

  useEffect(() => {
    if ((mode !== 'playing' && mode !== 'settled') || !roundId) return undefined
    let ws
    try {
      ws = openDominoSocket(roundId)
      socketRef.current = ws
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'state') {
            if (msg.players) setPlayers(msg.players)
            setTurn(msg.turn)
            setEnds(msg.ends)
            setBoneyardRemaining(msg.boneyardRemaining)
          }
          if (msg.type === 'move') {
            setTurn(msg.nextTurn)
            setEnds(msg.endsAfter)
            getDominoRound(roundId)
              .then((s) => {
                if (Array.isArray(s.moves)) setBoardTiles(reconstructDominoBoard(s.moves))
                if (Array.isArray(s.handSizes)) setHandSizes(s.handSizes)
              })
              .catch(() => null)
          }
          if (msg.type === 'settled') {
            setMode('settled')
            setResult(msg)
            getDominoProof(roundId).then((p) => {
              setProof(p)
              if (Array.isArray(p.moves)) setBoardTiles(reconstructDominoBoard(p.moves))
            }).catch(() => null)
          }
        } catch {
          // Ignore malformed socket frames.
        }
      }
    } catch {
      setError('Could not connect to the table socket.')
    }
    return () => { ws?.close(); socketRef.current = null }
  }, [mode, roundId])

  async function performJoin(rid, info, { expectHand = false } = {}) {
    if (!account) { onConnect(); return false }
    try {
      await assertCanAfford(account.address, info.entryFee + 10000, 'this table')
      setPhase('awaiting-signature')
      const signed = await joinDominoTable({
        roundId: rid, amount: info.entryFee, rpcUrl: info.rpcUrl, chainId: info.chainId, networkId: info.networkId,
      })
      setTxHash(signed?.txHash || '')
      setPhase('submitted')
      await registerPatiently(() => registerDominoJoin(rid, account.address, signed?.txHash))
      // One signature now authorizes every move at this table; if it's
      // declined, moves fall back to signing individually.
      await openMoveSession('domino', rid, account)
      // Only the second player can expect a hand right away; the creator's
      // hand is dealt later and picked up by the mode==='playing' effect.
      if (expectHand) {
        for (let attempt = 0; attempt < 40; attempt++) {
          try { const hand = await getDominoHand(rid, account.address); setMyHand(hand.hand); break }
          catch (hErr) { if (hErr?.status !== 425) throw hErr; await new Promise((r) => setTimeout(r, 3000)) }
        }
      }
      setPhase('confirmed')
      return true
    } catch (err) {
      if (err?.code === WALLET_METHOD_MISSING || err?.message === WALLET_METHOD_MISSING) {
        setError('This FleetWallet build does not expose canopy_signAndSubmit for join_domino yet.')
      } else {
        setError(err?.message || 'Could not join the table.')
      }
      setPhase('round-ready')
      return false
    }
  }

  async function handleCreateTable() {
    setError('')
    try {
      const created = await openDominoRound(account)
      const rid = created.roundId
      const info = await getDominoRoundInfo(rid)
      const infoObj = {
        entryFee: wireAmount(info.entryFee), rakeBps: wireAmount(info.rakeBps),
        chainId: wireAmount(info.chainId), networkId: wireAmount(info.networkId), rpcUrl: info.rpcUrl,
      }
      setRoundId(rid); setRoundInfo(infoObj); setBoardTiles([]); setMyHand([]); setEnds(null); setPhase('round-ready')
      const ok = await performJoin(rid, infoObj)
      if (ok) { setMySeat(0); setPlayers([account.address]); setMode('waiting') }
    } catch (err) {
      setError(`Could not open a table: ${err.message}`)
    }
  }

  async function handleAddOpponent() {
    setError('')
    if (houseRival) {
      try { await seatHouseRival('domino', roundId, account); setHouseSeated(true) }
      catch (err) { setError(err?.message || 'The house could not take the seat.') }
      return
    }
    const mine = account.address.toLowerCase()
    try {
      const seated = await addDominoOpponent(roundId)
      setBotAddress(String(seated.player).toLowerCase())
    } catch {
      // The custodial seat is still settling server-side (the join call holds
      // the lock through the entropy wait and can outrun the HTTP timeout).
      // Recover the bot address from the round's player list.
      for (let i = 0; i < 30; i++) {
        try {
          const rnd = await getDominoRound(roundId)
          const other = (rnd.players || []).map((p) => p.toLowerCase()).find((p) => p !== mine)
          if (other) { setBotAddress(other); return }
        } catch { /* keep polling */ }
        await new Promise((r) => setTimeout(r, 2000))
      }
      setError('The practice opponent is taking longer than expected to seat. Refresh and retry.')
    }
  }

  async function handleJoinTable() {
    const rid = joinInput.trim()
    if (!rid) return
    setError('')
    try {
      const info = await getDominoRoundInfo(rid)
      const infoObj = {
        entryFee: wireAmount(info.entryFee), rakeBps: wireAmount(info.rakeBps),
        chainId: wireAmount(info.chainId), networkId: wireAmount(info.networkId), rpcUrl: info.rpcUrl,
      }
      setRoundId(rid); setRoundInfo(infoObj); setBoardTiles([]); setMyHand([]); setEnds(null); setPhase('round-ready')
      const ok = await performJoin(rid, infoObj, { expectHand: true })
      if (ok) { setMySeat(1); setMode('playing') }
    } catch (err) {
      setError(err?.message || 'Could not find that table.')
    }
  }

  async function submitMove(action, tile, end) {
    setError('')
    try {
      // The signed move binds the current sequence + prior-state hash.
      const { actionContext } = await getDominoRound(roundId)
      const resp = await postDominoMove(roundId, account.address, actionContext, action, tile, end)
      if (action === 'play') {
        setMyHand((hand) => hand.filter((t) => !(t[0] === tile[0] && t[1] === tile[1])))
      } else if (action === 'draw') {
        const hand = await getDominoHand(roundId, account.address)
        setMyHand(hand.hand)
      }
      setSelectedTile(null)
      // Reflect the turn handoff immediately; the poll would catch up anyway.
      getDominoRound(roundId).then((s) => {
        if (s.turn != null) setTurn(s.turn)
        setEnds(s.ends ?? null)
        if (s.boneyardRemaining != null) setBoneyardRemaining(s.boneyardRemaining)
        if (Array.isArray(s.handSizes)) setHandSizes(s.handSizes)
        if (Array.isArray(s.moves)) setBoardTiles(reconstructDominoBoard(s.moves))
      }).catch(() => null)
      if (resp.settled) {
        setMode('settled')
        setResult(resp.settled)
        getDominoProof(roundId).then(setProof).catch(() => null)
      }
    } catch (err) {
      setError(err?.message || 'That move was not accepted.')
    }
  }

  function handleTileClick(tile) {
    if (mode !== 'playing' || turn !== mySeat) return
    const outs = legalDominoEnds(tile, ends)
    if (outs.length === 0) return
    if (outs.length === 1) {
      submitMove('play', tile, outs[0] === 'none' ? undefined : outs[0])
    } else {
      setSelectedTile(tile)
    }
  }

  const oppSeat = mySeat === 0 ? 1 : 0
  const seat = mySeat ?? 0
  const myTurn = mode === 'playing' && turn === mySeat
  const hasLegalPlay = myHand.some((t) => legalDominoEnds(t, ends).length > 0)
  const canDraw = myTurn && !hasLegalPlay && (boneyardRemaining ?? 0) > 0
  const canPass = myTurn && !hasLegalPlay && boneyardRemaining === 0
  const endTargets = selectedTile ? legalDominoEnds(selectedTile, ends).filter((e) => e !== 'none') : []
  const winnerSeats = useMemo(() => {
    if (Array.isArray(proof?.winners)) return proof.winners
    const mine = (account?.address || '').toLowerCase()
    return (result?.winners || []).map((addr) => (String(addr).toLowerCase() === mine ? mySeat : 1 - (mySeat ?? 0)))
  }, [proof?.winners, result?.winners, account?.address, mySeat])
  const handOver = mode === 'settled' && showStep >= 1
  const iWon = handOver && winnerSeats.includes(seat) && winnerSeats.length === 1
  const split = handOver && winnerSeats.length > 1
  const emptied = (proof?.reason ?? result?.reason) === 'emptied_hand'
  const myPayout = result && account ? result.payouts?.[account.address] : null
  const myNet = myPayout != null && roundInfo ? myPayout - roundInfo.entryFee : null
  const won = iWon && (myNet == null || myNet > 0)
  const shownNet = useCountUp(myNet != null && myNet > 0 ? myNet : 0, won && myNet != null)

  // Brief beat between the last tile and the announcement.
  useEffect(() => {
    if (mode !== 'settled') { setShowStep(0); return undefined }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShowStep(1); return undefined }
    const t = window.setTimeout(() => setShowStep(1), 900)
    return () => window.clearTimeout(t)
  }, [mode])

  // Header balance follows the table: after the entry leaves and after the payout lands.
  const refreshRef = useRef(refreshBalance)
  refreshRef.current = refreshBalance
  useEffect(() => { if (phase === 'confirmed' || handOver) refreshRef.current() }, [phase, handOver])

  function resetTable() {
    socketRef.current?.close()
    setMode('lobby'); setRoundId(null); setRoundInfo(null); setMySeat(null); setPlayers([]); setBotAddress(null)
    setMyHand([]); setEnds(null); setBoardTiles([]); setTurn(null); setBoneyardRemaining(null); setHandSizes([7, 7]); setHouseSeated(false)
    setPhase('idle'); setError(''); setTxHash(''); setSelectedTile(null); setResult(null); setProof(null)
    setShowStep(0); setJoinInput('')
  }

  return (
    <section className="cx-live-room dm-room" id="rooms">
      <div className="room-ambient ambient-one" />
      <div className="room-ambient ambient-two" />

      <div className="cx-room-main">
        <div className="cx-room-heading">
          <div>
            <span className="cx-eyebrow"><StatusDot online={!WAGERING_PAUSED} /> DOMINO · {WAGERING_PAUSED ? 'READ-ONLY PREVIEW' : 'LIVE TABLE'}</span>
            <h1>Heads-up at the <em>table.</em></h1>
            <p>Classic block dominoes, two players. The operator commits to a hidden seed before the table opens; the plugin only ever trusts a move log it can replay and verify itself.</p>
          </div>
        </div>

        {mode === 'lobby' && (
          <div className="dm-lobby">
            <div className="control-section">
              <span className="control-label">CREATE A TABLE</span>
              <p>Open a new heads-up table and share its ID with an opponent.</p>
              <button className="cx-gold-button" onClick={handleCreateTable} disabled={WAGERING_PAUSED}><span>{WAGERING_PAUSED ? 'Unavailable during audit' : account ? 'Create table' : 'Connect FleetWallet'}</span><b>→</b></button>
            </div>
            <div className="control-section">
              <span className="control-label">JOIN A TABLE</span>
              <p>Paste the table ID your opponent shared with you.</p>
              <div className="dm-join-row">
                <input aria-label="Domino table ID" value={joinInput} onChange={(event) => setJoinInput(event.target.value)} placeholder="Table ID" />
                <button className="cx-gold-button" onClick={handleJoinTable} disabled={WAGERING_PAUSED || !joinInput.trim()}><span>{WAGERING_PAUSED ? 'Unavailable during audit' : account ? 'Join table' : 'Connect FleetWallet'}</span><b>→</b></button>
              </div>
            </div>
            {error && <p className="error-copy">{error}</p>}
          </div>
        )}

        {mode !== 'lobby' && (
          <div className="cx-room-layout dm-layout">
            <div className={`cx-game-stage dm-stage ${won ? 'is-win' : ''}`}>
              {won && <WinMotes />}
              <div className="dm-table">
                <div className="pk-rail" aria-hidden="true" />

                <TableSeat
                  side="top" className="dm-seat" name="Opponent"
                  stack={mode === 'waiting' ? 'Seat open' : `${handSizes[oppSeat]} tile${handSizes[oppSeat] === 1 ? '' : 's'}`}
                  isTurn={mode === 'playing' && turn === oppSeat}
                  winner={handOver && winnerSeats.includes(oppSeat)}
                  badge={handOver && winnerSeats.includes(oppSeat) ? (emptied ? 'Dominoes!' : 'Lowest count') : ''}
                >
                  {mode === 'waiting'
                    ? <><span className="dm-slot" /><span className="dm-slot" /></>
                    : Array.from({ length: handSizes[oppSeat] }).map((_, index) => (
                      <DominoTile key={index} faceDown orientation="vertical" deal={0.04 * index} />
                    ))}
                </TableSeat>

                <div className="dm-center">
                  {mode === 'waiting' ? (
                    <div className="pk-waiting">
                      <span className="pk-street">WAITING FOR AN OPPONENT</span>
                      <p>Share this table ID: <code>{roundId}</code></p>
                      {(houseRival || PRACTICE_OPPONENT) && mySeat === 0 && !botAddress && !houseSeated && (
                        <button className="cx-gold-button" onClick={handleAddOpponent}><span>{houseRival ? 'Play against the house' : 'Add practice opponent'}</span><b>→</b></button>
                      )}
                      {(botAddress || houseSeated) && <p className="pk-dealing">{houseSeated ? 'The house took the seat' : 'Practice opponent seated'} — dealing…</p>}
                    </div>
                  ) : (
                    <>
                      <div className="dm-status-row">
                        <span className="pk-street">
                          {mode === 'settled' ? (emptied ? 'DOMINOES' : 'TABLE BLOCKED') : myTurn ? 'YOUR MOVE' : "OPPONENT'S MOVE"}
                        </span>
                        <Boneyard count={boneyardRemaining} canDraw={canDraw} canPass={canPass}
                          onDraw={() => submitMove(canDraw ? 'draw' : 'pass')} />
                      </div>
                      {boardTiles.length === 0
                        ? <p className="dm-board-hint">{myTurn ? 'The table is empty — play any tile to open it.' : 'The table is empty — waiting for the opening tile.'}</p>
                        : <DominoChain tiles={boardTiles} ends={ends} targets={endTargets}
                          onPick={(end) => selectedTile && submitMove('play', selectedTile, end)} />}
                      {selectedTile && <p className="dm-pick-hint">Choose an end for {selectedTile[0]}|{selectedTile[1]} — or tap the tile again to cancel.</p>}
                    </>
                  )}
                </div>

                <TableSeat
                  side="bottom" className="dm-seat" name="You" you
                  stack={mode === 'waiting' ? `${cnpy(roundInfo?.entryFee || 0)} CNPY entry` : `${myHand.length} tile${myHand.length === 1 ? '' : 's'}`}
                  isTurn={myTurn} winner={handOver && winnerSeats.includes(seat)}
                  badge={handOver && winnerSeats.includes(seat) ? (emptied ? 'Dominoes!' : 'Lowest count') : ''}
                >
                  {myHand.map((tile, index) => {
                    const playable = myTurn && legalDominoEnds(tile, ends).length > 0
                    const isSelected = Boolean(selectedTile && selectedTile[0] === tile[0] && selectedTile[1] === tile[1])
                    return (
                      <DominoTile
                        key={`${tile[0]}-${tile[1]}`} tile={tile} orientation="vertical" deal={0.05 * index}
                        selected={isSelected} playable={playable} dim={myTurn && !playable}
                        disabled={!myTurn || !playable}
                        onClick={() => (isSelected ? setSelectedTile(null) : handleTileClick(tile))}
                      />
                    )
                  })}
                  {mode === 'waiting' && !myHand.length && <><span className="dm-slot" /><span className="dm-slot" /></>}
                </TableSeat>
              </div>

              {handOver && (
                <div className={`pk-outcome ${won ? 'is-win' : ''}`} role="status">
                  <strong>
                    {split ? 'Split decision'
                      : iWon ? (emptied ? 'Dominoes! You emptied your hand' : 'Table blocked — you hold the lowest count')
                      : (emptied ? 'Opponent emptied their hand' : 'Table blocked — opponent holds the lowest count')}
                  </strong>
                  <button className="cx-gold-button" onClick={resetTable}><span>New table</span><b>→</b></button>
                </div>
              )}
            </div>

            <div className="round-side dm-side">
              <TxStatus phase={phase} error={error} txHash={txHash} />
              {handOver && result && (
                <div className={`result-card ${won ? 'is-win' : ''}`}>
                  <span className="cx-eyebrow">ROUND RESULT</span>
                  <strong>{won ? 'You won' : split ? 'Split decision' : 'No luck this game'}</strong>
                  {won && myNet != null && <span className="rw-win-amount">+{cnpyShort(shownNet)} <small>CNPY</small></span>}
                  <p>{emptied ? 'Hand emptied' : 'Table blocked'} · {won ? 'Profit after rake, paid on-chain.' : 'Better luck at the next table.'}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {roundId && (
          <div className="cx-proof-strip">
            <div><span className="proof-icon" aria-hidden="true">◇</span><span><small>ROUND PROOF DATA</small><strong>Table {roundId.slice(0, 12)}…</strong></span></div>
            <div><small>ENTRY</small><strong>{roundInfo ? `${cnpy(roundInfo.entryFee)} CNPY` : '—'}</strong></div>
            <div><small>CHAIN</small><strong>{roundInfo?.chainId || 'Dynamic'}</strong></div>
            <div><small>RAKE</small><strong>{roundInfo?.rakeBps ? `${roundInfo.rakeBps / 100}%` : '—'}</strong></div>
            <button onClick={() => getDominoProof(roundId).then(setProof).catch(() => null)}>Refresh proof</button>
          </div>
        )}
        {roundId && <TableIdentifier roundId={roundId} />}
        <ProofCommitment proof={proof} />
        {proof?.seed && <p className="rw-seed-reveal">Seed revealed: <code>{proof.seed}</code> — anyone can replay the {proof.moves?.length || 0}-move log against it and confirm the winner themselves.</p>}
      </div>
    </section>
  )
}

const POKER_EMPTY_TABLE = {
  turn: null, street: null, board: [], pot: 0,
  streetContributed: [0, 0], stacks: [0, 0], folded: [false, false], allIn: [false, false], finished: false,
}
const trimTokens = (raw) => formatTokens(raw).replace(/\.?0+$/, '')
const cardKey = (card) => `${card[0]}${card[1]}`

function PokerRoom({ account, onConnect, refreshBalance = () => {} }) {
  const [mode, setMode] = useState('lobby') // lobby -> waiting -> playing -> settled
  const [roundId, setRoundId] = useState(null)
  const [roundInfo, setRoundInfo] = useState(null)
  const [mySeat, setMySeat] = useState(null)
  const [, setPlayers] = useState([])
  const [botAddress, setBotAddress] = useState(null)
  const [houseRival, setHouseRival] = useState(false) // devnet: the service can seat the house as your opponent
  const [houseSeated, setHouseSeated] = useState(false)
  const [myHole, setMyHole] = useState([])
  const [table, setTable] = useState(POKER_EMPTY_TABLE)
  const [showStep, setShowStep] = useState(0) // 0 hand ending -> 1 cards turn over -> 2 result announced
  const [joinInput, setJoinInput] = useState('')
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [raiseAmount, setRaiseAmount] = useState('')
  const [result, setResult] = useState(null)
  const [proof, setProof] = useState(null)
  const socketRef = useRef(null)

  function applyTable(status) {
    if (status.players) setPlayers(status.players)
    setTable({
      turn: status.turn ?? null, street: status.street ?? null, board: status.board || [],
      pot: status.pot ?? 0, streetContributed: status.streetContributed || [0, 0],
      stacks: status.stacks || [0, 0], folded: status.folded || [false, false],
      allIn: status.allIn || [false, false], finished: Boolean(status.finished),
    })
  }

  useEffect(() => {
    let alive = true
    getCapabilities().then((c) => { if (alive) setHouseRival(Boolean(c?.houseRival)) }).catch(() => null)
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (mode !== 'waiting' || !roundId) return undefined
    const id = window.setInterval(() => {
      getPokerRound(roundId).then((status) => {
        if (status.players.length === 2) {
          setPlayers(status.players)
          setMode('playing')
        }
      }).catch(() => null)
    }, 2000)
    return () => window.clearInterval(id)
  }, [mode, roundId])

  // The game WS is operator-gated, so a browser can't subscribe to it (403).
  // Poll the table state and settlement while a hand is live.
  useEffect(() => {
    if (mode !== 'playing' || !roundId) return undefined
    const id = window.setInterval(() => {
      getPokerRound(roundId).then((status) => {
        if (status.turn != null || status.finished) applyTable(status)
        if (status.status === 'settled') {
          getPokerProof(roundId).then((p) => {
            setProof(p)
            setResult((prev) => prev || {
              winners: (p.winners || []).map((s) => status.players?.[s]).filter(Boolean),
              reason: p.reason, payouts: {},
            })
          }).catch(() => null)
          setMode('settled')
        }
      }).catch(() => null)
    }, 2000)
    return () => window.clearInterval(id)
  }, [mode, roundId])

  // The table creator (seat 0) buys in before an opponent exists, so their
  // hole cards are not dealt until the second player triggers prepare_outcome.
  // Fetch them once the table is live, retrying while the entropy window
  // finalizes -- the 2nd join holds the manager lock through that wait, so a
  // fetch here can 425 OR time out; either way, keep trying.
  useEffect(() => {
    if (mode !== 'playing' || !roundId || !account || myHole.length > 0) return undefined
    let cancelled = false
    ;(async () => {
      for (let attempt = 0; attempt < 60 && !cancelled; attempt++) {
        try {
          const hole = await getPokerHand(roundId, account.address)
          if (Array.isArray(hole.hole) && hole.hole.length > 0) { if (!cancelled) setMyHole(hole.hole); return }
        } catch { /* 425 or timeout while the entropy window finalizes */ }
        await new Promise((r) => setTimeout(r, 3000))
      }
    })()
    return () => { cancelled = true }
  }, [mode, roundId, account, myHole.length])

  // Practice opponent: check/call on every street so the hand always reaches
  // showdown. Local valueless stacks only.
  const botBusy = useRef(false)
  useEffect(() => {
    if (mode !== 'playing' || !roundId || !botAddress || table.finished) return undefined
    if (table.turn == null || table.turn === mySeat || botBusy.current) return undefined
    botBusy.current = true
    let cancelled = false
    ;(async () => {
      try {
        await new Promise((r) => setTimeout(r, 700))
        if (cancelled) return
        const resp = await botPokerAction(roundId, botAddress, 'check_call', 0)
        getPokerRound(roundId).then(applyTable).catch(() => null)
        if (resp?.settled && !cancelled) {
          setResult(resp.settled)
          setMode('settled')
          getPokerProof(roundId).then(setProof).catch(() => null)
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'The practice opponent could not act.')
      } finally {
        botBusy.current = false
      }
    })()
    return () => { cancelled = true; botBusy.current = false }
  // The bot can act twice in a row (e.g. big blind opens every postflop street), so the turn
  // index alone doesn't change; the street and pot do.
  }, [mode, roundId, botAddress, table.turn, table.street, table.pot, table.finished, mySeat])

  useEffect(() => {
    if ((mode !== 'playing' && mode !== 'settled') || !roundId) return undefined
    let ws
    try {
      ws = openPokerSocket(roundId)
      socketRef.current = ws
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'state') {
            if (msg.players) setPlayers(msg.players)
            setTable((prev) => ({
              ...prev, turn: msg.turn ?? prev.turn, street: msg.street ?? prev.street,
              board: msg.board || prev.board, pot: msg.pot ?? prev.pot, stacks: msg.stacks || prev.stacks,
            }))
          }
          if (msg.type === 'action') {
            // The broadcast carries just enough for a live turn indicator;
            // the authoritative streetContributed/stacks/folded snapshot
            // (needed for the call-amount and stack display) is re-fetched
            // right after, same trust model as Domino re-fetching a hand
            // after a draw.
            getPokerRound(roundId).then(applyTable).catch(() => null)
          }
          if (msg.type === 'settled') {
            setMode('settled')
            setResult(msg)
            getPokerProof(roundId).then(setProof).catch(() => null)
          }
        } catch {
          // Ignore malformed socket frames.
        }
      }
    } catch {
      setError('Could not connect to the table socket.')
    }
    return () => { ws?.close(); socketRef.current = null }
  }, [mode, roundId])

  async function performJoin(rid, info, { expectHand = false } = {}) {
    if (!account) { onConnect(); return false }
    try {
      await assertCanAfford(account.address, info.buyIn + 10000, 'this table buy-in')
      setPhase('awaiting-signature')
      const signed = await joinPokerTable({
        roundId: rid, amount: info.buyIn, rpcUrl: info.rpcUrl, chainId: info.chainId, networkId: info.networkId,
      })
      setTxHash(signed?.txHash || '')
      setPhase('submitted')
      await registerPatiently(() => registerPokerJoin(rid, account.address, signed?.txHash))
      // One signature now authorizes every action at this table; if it's
      // declined, actions fall back to signing individually.
      await openMoveSession('poker', rid, account)
      // Only the second player can expect hole cards right away; the creator's
      // are dealt later and picked up by the mode==='playing' effect.
      if (expectHand) {
        for (let attempt = 0; attempt < 40; attempt++) {
          try { const hole = await getPokerHand(rid, account.address); setMyHole(hole.hole); break }
          catch (hErr) { if (hErr?.status !== 425) throw hErr; await new Promise((r) => setTimeout(r, 3000)) }
        }
      }
      setPhase('confirmed')
      return true
    } catch (err) {
      if (err?.code === WALLET_METHOD_MISSING || err?.message === WALLET_METHOD_MISSING) {
        setError('This FleetWallet build does not expose canopy_signAndSubmit for join_poker yet.')
      } else {
        setError(err?.message || 'Could not join the table.')
      }
      setPhase('round-ready')
      return false
    }
  }

  async function handleCreateTable() {
    setError('')
    try {
      const created = await openPokerRound(account)
      const rid = created.roundId
      const info = await getPokerRoundInfo(rid)
      const infoObj = {
        smallBlind: wireAmount(info.smallBlind), bigBlind: wireAmount(info.bigBlind), buyIn: wireAmount(info.buyIn),
        rakeBps: wireAmount(info.rakeBps), chainId: wireAmount(info.chainId), networkId: wireAmount(info.networkId),
        rpcUrl: info.rpcUrl,
      }
      setRoundId(rid); setRoundInfo(infoObj); setPhase('round-ready')
      const ok = await performJoin(rid, infoObj)
      if (ok) { setMySeat(0); setPlayers([account.address]); setMode('waiting') }
    } catch (err) {
      setError(`Could not open a table: ${err.message}`)
    }
  }

  async function handleAddOpponent() {
    setError('')
    if (houseRival) {
      try { await seatHouseRival('poker', roundId, account); setHouseSeated(true) }
      catch (err) { setError(err?.message || 'The house could not take the seat.') }
      return
    }
    const mine = account.address.toLowerCase()
    try {
      const seated = await addPokerOpponent(roundId)
      setBotAddress(String(seated.player).toLowerCase())
    } catch {
      // The custodial seat is still settling server-side (the join call holds
      // the lock through the entropy wait and can outrun the HTTP timeout).
      // Recover the bot address from the round's player list.
      for (let i = 0; i < 30; i++) {
        try {
          const rnd = await getPokerRound(roundId)
          const other = (rnd.players || []).map((p) => p.toLowerCase()).find((p) => p !== mine)
          if (other) { setBotAddress(other); return }
        } catch { /* keep polling */ }
        await new Promise((r) => setTimeout(r, 2000))
      }
      setError('The practice opponent is taking longer than expected to seat. Refresh and retry.')
    }
  }

  async function handleJoinTable() {
    const rid = joinInput.trim()
    if (!rid) return
    setError('')
    try {
      const info = await getPokerRoundInfo(rid)
      const infoObj = {
        smallBlind: wireAmount(info.smallBlind), bigBlind: wireAmount(info.bigBlind), buyIn: wireAmount(info.buyIn),
        rakeBps: wireAmount(info.rakeBps), chainId: wireAmount(info.chainId), networkId: wireAmount(info.networkId),
        rpcUrl: info.rpcUrl,
      }
      setRoundId(rid); setRoundInfo(infoObj); setPhase('round-ready')
      const ok = await performJoin(rid, infoObj, { expectHand: true })
      if (ok) { setMySeat(1); setMode('playing') }
    } catch (err) {
      setError(err?.message || 'Could not find that table.')
    }
  }

  async function submitAction(action, amount = 0) {
    setError('')
    try {
      // The signed action binds the current sequence + prior-state hash.
      const { actionContext } = await getPokerRound(roundId)
      const resp = await postPokerAction(roundId, account.address, actionContext, action, amount)
      getPokerRound(roundId).then(applyTable).catch(() => null)
      if (resp.settled) {
        setMode('settled')
        setResult(resp.settled)
        getPokerProof(roundId).then(setProof).catch(() => null)
      }
    } catch (err) {
      setError(err?.message || 'That action was not accepted.')
    }
  }

  function handleRaiseSubmit(event) {
    event.preventDefault()
    let amount
    try { amount = parseTokens(raiseAmount) } catch (err) { setError(err.message); return }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid raise amount.'); return }
    submitAction('bet_raise', amount)
  }

  const oppSeat = mySeat === 0 ? 1 : 0
  const seat = mySeat ?? 0
  const myTurn = mode === 'playing' && table.turn === mySeat
  const maxStreetContributed = Math.max(...table.streetContributed)
  const toCall = mySeat != null ? Math.max(0, maxStreetContributed - (table.streetContributed[mySeat] || 0)) : 0
  const bigBlind = roundInfo?.bigBlind || 0
  const myStack = table.stacks[seat] || 0
  const maxRaiseTo = (table.streetContributed[seat] || 0) + myStack
  const minRaiseTo = Math.min(maxRaiseTo, maxStreetContributed + bigBlind)
  const canRaise = maxRaiseTo > maxStreetContributed && !table.allIn[oppSeat]
  const potAfterCall = table.pot + toCall
  const sizePresets = [
    { id: 'min', label: 'Min', to: minRaiseTo },
    { id: 'half', label: '½ pot', to: maxStreetContributed + Math.floor(potAfterCall / 2) },
    { id: 'pot', label: 'Pot', to: maxStreetContributed + potAfterCall },
    { id: 'allin', label: 'All-in', to: maxRaiseTo },
  ].map((preset) => ({ ...preset, to: Math.max(minRaiseTo, Math.min(maxRaiseTo, preset.to)) }))
  const raiseNow = (() => { try { return parseTokens(raiseAmount) } catch { return NaN } })()

  // After the hand: both players' cards come with the proof; work out who played what.
  const holes = proof?.hole || null
  const showdown = mode === 'settled' && proof?.reason === 'showdown' && holes && proof?.board?.length === 5
  const hands = useMemo(
    () => (showdown ? holes.map((hole) => bestHand([...hole, ...proof.board])) : null),
    [showdown, holes, proof?.board],
  )
  const winnerSeats = useMemo(() => {
    if (Array.isArray(proof?.winners)) return proof.winners
    const mine = (account?.address || '').toLowerCase()
    return (result?.winners || []).map((addr) => (String(addr).toLowerCase() === mine ? mySeat : 1 - (mySeat ?? 0)))
  }, [proof?.winners, result?.winners, account?.address, mySeat])
  const handOver = mode === 'settled' && showStep >= 2
  const iWon = handOver && winnerSeats.includes(mySeat) && winnerSeats.length === 1
  const split = handOver && winnerSeats.length > 1
  const myPayout = result && account ? result.payouts?.[account.address] : null
  const myNet = myPayout != null && roundInfo ? myPayout - roundInfo.buyIn : null
  const won = iWon && (myNet == null || myNet > 0)
  const shownNet = useCountUp(myNet != null && myNet > 0 ? myNet : 0, won && myNet != null)
  const playingCards = useMemo(() => {
    if (!handOver || !hands) return null
    return new Set(winnerSeats.flatMap((w) => hands[w].cards.map(cardKey)))
  }, [handOver, hands, winnerSeats])
  const foldedEnd = mode === 'settled' && (proof?.reason ?? result?.reason) === 'fold'
  // The engine's stacks exclude the pot; once the hand is over the winner's plate shows it awarded.
  const stackOf = (i) => (table.stacks[i] || 0) + (handOver && winnerSeats.includes(i) ? Math.floor(table.pot / winnerSeats.length) : 0)

  // Stage the ending: hand finishes -> cards turn over -> result announced.
  useEffect(() => {
    if (mode !== 'settled') { setShowStep(0); return undefined }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setShowStep(2); return undefined }
    const t1 = window.setTimeout(() => setShowStep((v) => Math.max(v, 1)), foldedEnd ? 0 : 700)
    const t2 = window.setTimeout(() => setShowStep(2), foldedEnd ? 600 : 2200)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2) }
  }, [mode, foldedEnd])

  // Header balance follows the table: after the buy-in leaves and after the payout lands.
  const refreshRef = useRef(refreshBalance)
  refreshRef.current = refreshBalance
  useEffect(() => { if (phase === 'confirmed' || handOver) refreshRef.current() }, [phase, handOver])

  function resetTable() {
    socketRef.current?.close()
    setMode('lobby'); setRoundId(null); setRoundInfo(null); setMySeat(null); setPlayers([]); setBotAddress(null)
    setMyHole([]); setHouseSeated(false); setTable(POKER_EMPTY_TABLE); setPhase('idle'); setError(''); setTxHash('')
    setRaiseAmount(''); setResult(null); setProof(null); setShowStep(0); setJoinInput('')
  }

  return (
    <section className="cx-live-room pk-room" id="rooms">
      <div className="room-ambient ambient-one" />
      <div className="room-ambient ambient-two" />

      <div className="cx-room-main">
        <div className="cx-room-heading">
          <div>
            <span className="cx-eyebrow"><StatusDot online={!WAGERING_PAUSED} /> POKER · {WAGERING_PAUSED ? 'READ-ONLY PREVIEW' : 'LIVE TABLE'}</span>
            <h1>Heads-up <em>No-Limit.</em></h1>
            <p>The operator commits to a hidden seed before the table opens; the plugin only ever trusts a betting-action log it can replay and verify itself, all the way to the showdown.</p>
          </div>
        </div>

        {mode === 'lobby' && (
          <div className="dm-lobby">
            <div className="control-section">
              <span className="control-label">CREATE A TABLE</span>
              <p>Open a new heads-up table and share its ID with an opponent.</p>
              <button className="cx-gold-button" onClick={handleCreateTable} disabled={WAGERING_PAUSED}><span>{WAGERING_PAUSED ? 'Unavailable during audit' : account ? 'Create table' : 'Connect FleetWallet'}</span><b>→</b></button>
            </div>
            <div className="control-section">
              <span className="control-label">JOIN A TABLE</span>
              <p>Paste the table ID your opponent shared with you.</p>
              <div className="dm-join-row">
                <input aria-label="Poker table ID" value={joinInput} onChange={(event) => setJoinInput(event.target.value)} placeholder="Table ID" />
                <button className="cx-gold-button" onClick={handleJoinTable} disabled={WAGERING_PAUSED || !joinInput.trim()}><span>{WAGERING_PAUSED ? 'Unavailable during audit' : account ? 'Join table' : 'Connect FleetWallet'}</span><b>→</b></button>
              </div>
            </div>
            {error && <p className="error-copy">{error}</p>}
          </div>
        )}

        {mode !== 'lobby' && (
          <div className="cx-room-layout pk-layout">
            <div className={`cx-game-stage pk-stage ${won ? 'is-win' : ''}`}>
              {won && <WinMotes />}
              <div className={`pk-table ${mode === 'settled' ? 'is-settled' : ''}`}>
                <div className="pk-rail" aria-hidden="true" />

                <TableSeat
                  side="top" name="Opponent" you={false}
                  stack={mode === 'waiting' ? 'Seat open' : `${cnpy(stackOf(oppSeat))} CNPY`}
                  bet={mode === 'playing' ? table.streetContributed[oppSeat] : 0}
                  isTurn={mode === 'playing' && table.turn === oppSeat}
                  isDealer={mode !== 'waiting' && oppSeat === 0}
                  folded={table.folded[oppSeat]}
                  winner={handOver && winnerSeats.includes(oppSeat)}
                  badge={handOver && hands && winnerSeats.includes(oppSeat) ? hands[oppSeat].name
                    : table.folded[oppSeat] ? 'Folded' : table.allIn[oppSeat] ? 'All-in' : ''}
                >
                  {mode === 'waiting' ? (
                    <><span className="pk-slot" /><span className="pk-slot" /></>
                  ) : [0, 1].map((i) => {
                    const revealed = showdown && showStep >= 1 && holes?.[oppSeat]?.[i]
                    const card = revealed ? holes[oppSeat][i] : null
                    return (
                      <PlayingCard key={i} card={card} faceDown={!revealed} deal={0.05 + i * 0.12}
                        dim={Boolean(playingCards && card && !playingCards.has(cardKey(card)))}
                        win={Boolean(playingCards && card && playingCards.has(cardKey(card)))} />
                    )
                  })}
                </TableSeat>

                <div className="pk-center">
                  {mode === 'waiting' ? (
                    <div className="pk-waiting">
                      <span className="pk-street">WAITING FOR AN OPPONENT</span>
                      <p>Share this table ID: <code>{roundId}</code></p>
                      {(houseRival || PRACTICE_OPPONENT) && mySeat === 0 && !botAddress && !houseSeated && (
                        <button className="cx-gold-button" onClick={handleAddOpponent}><span>{houseRival ? 'Play against the house' : 'Add practice opponent'}</span><b>→</b></button>
                      )}
                      {(botAddress || houseSeated) && <p className="pk-dealing">{houseSeated ? 'The house took the seat' : 'Practice opponent seated'} — dealing…</p>}
                    </div>
                  ) : (
                    <>
                      <span className="pk-street">{mode === 'settled' ? (showdown ? 'SHOWDOWN' : 'HAND COMPLETE') : (table.street || 'preflop').toUpperCase()}</span>
                      <div className="pk-board-cards">
                        {Array.from({ length: 5 }).map((_, index) => {
                          const card = table.board[index]
                          if (!card) return <span className="pk-slot" key={`slot-${index}`} />
                          return (
                            <PlayingCard key={cardKey(card)} card={card} deal={(index < 3 ? index : 0) * 0.14}
                              dim={Boolean(playingCards && !playingCards.has(cardKey(card)))}
                              win={Boolean(playingCards && playingCards.has(cardKey(card)))} />
                          )
                        })}
                      </div>
                      <div className="pk-pot"><i className="pk-chip" /><span>{handOver ? 'Awarded' : 'Pot'}</span><strong>{cnpy(table.pot)}</strong><small>CNPY</small></div>
                    </>
                  )}
                </div>

                <TableSeat
                  side="bottom" name="You" you
                  stack={mode === 'waiting' ? `${cnpy(roundInfo?.buyIn || 0)} CNPY` : `${cnpy(stackOf(seat))} CNPY`}
                  bet={mode === 'playing' ? table.streetContributed[seat] : 0}
                  isTurn={myTurn} isDealer={mode !== 'waiting' && seat === 0}
                  folded={table.folded[seat]}
                  winner={handOver && winnerSeats.includes(seat)}
                  badge={handOver && hands && winnerSeats.includes(seat) ? hands[seat].name
                    : table.folded[seat] ? 'Folded' : table.allIn[seat] ? 'All-in' : ''}
                >
                  {(myHole.length ? myHole : holes?.[seat] || []).map((card, index) => (
                    <PlayingCard key={cardKey(card)} card={card} deal={0.25 + index * 0.14}
                      dim={Boolean(playingCards && !playingCards.has(cardKey(card)))}
                      win={Boolean(playingCards && playingCards.has(cardKey(card)))} />
                  ))}
                  {!myHole.length && !holes?.[seat] && <><span className="pk-slot" /><span className="pk-slot" /></>}
                </TableSeat>
              </div>

              {mode === 'playing' && (
                <div className="pk-actionbar">
                  {myTurn && !table.finished ? (
                    <>
                      <div className="pk-actions-main">
                        <button className="pk-action-fold" onClick={() => submitAction('fold')}>Fold</button>
                        <button className="pk-action-call" onClick={() => submitAction('check_call')}>
                          {toCall > 0 ? <>Call <b>{cnpy(toCall)}</b></> : 'Check'}
                        </button>
                      </div>
                      {canRaise && (
                        <form className="pk-sizing" onSubmit={handleRaiseSubmit}>
                          <div className="pk-presets" role="group" aria-label="Bet size">
                            {sizePresets.map((preset) => (
                              <button type="button" key={preset.id} className={raiseNow === preset.to ? 'is-active' : ''}
                                onClick={() => setRaiseAmount(trimTokens(preset.to))}>{preset.label}</button>
                            ))}
                          </div>
                          <input type="range" aria-label="Bet size slider" className="pk-slider"
                            min={minRaiseTo} max={maxRaiseTo} step={Math.max(1, roundInfo?.smallBlind || 1)}
                            value={Number.isFinite(raiseNow) && raiseNow >= minRaiseTo ? Math.min(raiseNow, maxRaiseTo) : minRaiseTo}
                            onChange={(event) => setRaiseAmount(trimTokens(Number(event.target.value)))} />
                          <div className="pk-raise-form">
                            <input aria-label="Raise total in CNPY" type="number" min="0" step="0.000001"
                              placeholder={trimTokens(minRaiseTo)} value={raiseAmount} onChange={(event) => setRaiseAmount(event.target.value)} />
                            <button type="submit" className="pk-action-raise">{toCall > 0 ? 'Raise to' : 'Bet'}</button>
                          </div>
                        </form>
                      )}
                    </>
                  ) : (
                    <p className="pk-wait">{table.finished ? 'Settling the hand…' : "Opponent is thinking…"}</p>
                  )}
                </div>
              )}

              {handOver && (
                <div className={`pk-outcome ${won ? 'is-win' : ''}`} role="status">
                  <strong>
                    {split ? 'Split pot'
                      : foldedEnd ? (iWon ? 'Opponent folded — the pot is yours' : 'You folded')
                      : iWon ? <>You win with {hands?.[seat]?.name}</>
                      : <>Opponent wins with {hands?.[oppSeat]?.name}</>}
                  </strong>
                  <button className="cx-gold-button" onClick={resetTable}><span>New table</span><b>→</b></button>
                </div>
              )}
            </div>

            <div className="round-side pk-side">
              <TxStatus phase={phase} error={error} txHash={txHash} />
              {handOver && result && (
                <div className={`result-card ${won ? 'is-win' : ''}`}>
                  <span className="cx-eyebrow">HAND RESULT</span>
                  <strong>{won ? 'You won' : split ? 'Split pot' : 'No luck this hand'}</strong>
                  {won && myNet != null && <span className="rw-win-amount">+{cnpyShort(shownNet)} <small>CNPY</small></span>}
                  <p>{foldedEnd ? 'Decided by a fold' : 'Showdown'} · {won ? 'Profit after rake, paid on-chain.' : 'Better cards next hand.'}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {roundId && (
          <div className="cx-proof-strip">
            <div><span className="proof-icon" aria-hidden="true">◇</span><span><small>ROUND PROOF DATA</small><strong>Table {roundId.slice(0, 12)}…</strong></span></div>
            <div><small>BLINDS</small><strong>{roundInfo ? `${cnpy(roundInfo.smallBlind)}/${cnpy(roundInfo.bigBlind)}` : '—'}</strong></div>
            <div><small>CHAIN</small><strong>{roundInfo?.chainId || 'Dynamic'}</strong></div>
            <div><small>RAKE</small><strong>{roundInfo?.rakeBps ? `${roundInfo.rakeBps / 100}%` : '—'}</strong></div>
            <button onClick={() => getPokerProof(roundId).then(setProof).catch(() => null)}>Refresh proof</button>
          </div>
        )}
        {roundId && <TableIdentifier roundId={roundId} />}
        <ProofCommitment proof={proof} />
        {proof?.seed && <p className="rw-seed-reveal">Seed revealed: <code>{proof.seed}</code> — anyone can replay the {proof.actions?.length || 0}-action log against it and confirm the winner themselves.</p>}
      </div>
    </section>
  )
}

// Whole-CNPY display only (never used for a transaction amount) -- rounds
// for a clean marketing stat instead of formatTokens()'s exact 6-decimal
// precision, which reads as noise here (e.g. "48977.491588").
function wholeCnpy(rawMicroUnits) {
  const whole = Math.round(Number(rawMicroUnits || 0) / 1_000_000)
  return Number.isFinite(whole) ? whole.toLocaleString() : '—'
}

function GraduationBanner() {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const load = () => {
      jsonGet('/chain/graduation')
        .then((d) => { if (alive) { setData(d); setFailed(false) } })
        .catch(() => { if (alive) setFailed(true) })
    }
    load()
    const id = window.setInterval(load, 60_000)
    return () => { alive = false; window.clearInterval(id) }
  }, [])

  // Hide outright once graduated (the ask becomes moot) or on a persistent
  // load failure -- a promo banner stuck on "Loading…" forever looks broken.
  if (data?.isGraduated || (failed && !data)) return null

  const pct = data ? Math.min(100, Math.max(0, data.completionPercent)) : 0
  const tradeUrl = data?.tradeUrl || 'https://app.canopynetwork.org/chains/48'

  return (
    <section className="cx-graduation" aria-label="CASN chain graduation progress">
      <div className="cx-graduation-copy">
        <span className="cx-eyebrow"><StatusDot online={Boolean(data)} /> {data?.tokenSymbol || 'CASN'} · GRADUATING ON CANOPY</span>
        <h2>Help Canasino <em>graduate.</em></h2>
        <p>
          {data
            ? <>Canasino's chain is still a virtual listing on Canopy's launchpad. <strong>{wholeCnpy(data.cnpyRemaining)} CNPY</strong> more in trading volume and it graduates into its own independent chain.</>
            : 'Loading live graduation progress…'}
        </p>
        <a className="cx-gold-button graduation-button" href={tradeUrl} target="_blank" rel="noreferrer">
          <span>Trade {data?.tokenSymbol || 'CASN'} to help it graduate</span><b>↗</b>
        </a>
      </div>
      <div className="cx-graduation-progress">
        <div className="cx-graduation-bar"><div className="cx-graduation-fill" style={{ width: `${pct}%` }} /></div>
        <div className="cx-graduation-stats">
          <span><strong>{data ? `${pct.toFixed(1)}%` : '—'}</strong><small>to graduation</small></span>
          <span><strong>{data ? wholeCnpy(data.currentCnpyReserve) : '—'}</strong><small>CNPY raised</small></span>
          <span><strong>{data ? wholeCnpy(data.thresholdCnpy) : '—'}</strong><small>CNPY goal</small></span>
        </div>
      </div>
    </section>
  )
}

function Home({ onPlay }) {
  return (
    <>
      <section className="cx-hero" id="home">
        <div className="cx-hero-glow" />
        <div className="cx-hero-content">
          <span className="cx-eyebrow"><StatusDot online={false} /> CANASINO SECURITY PREVIEW</span>
          <h1>Play with the house.<br /><em>Verify the house.</em></h1>
          <p>Explore Canasino's table designs and proposed on-chain proof flows. Wagering remains deliberately disabled until wallet authorization and game-integrity controls are complete.</p>
          <div className="hero-buttons"><button className="cx-gold-button hero-button" onClick={() => onPlay(games[0])}><span>Explore Bingo preview</span><b>→</b></button><a className="cx-text-button" href="#fairness">Review the proof model <b>↗</b></a></div>
          <div className="hero-proof-row"><span><i>✓</i> Wallet-aware UI</span><span><i>✓</i> Transactions disabled</span><span><i>✓</i> Responsive tables</span><span><i>✓</i> Proof model explained</span></div>
        </div>
        <div className="cx-hero-art" aria-hidden="true">
          <div className="hero-floor" />
          <div className="hero-chip chip-back"><span>CASN</span></div>
          <div className="hero-chip chip-main"><small>CANASINO</small><strong>C</strong><span>PLAY · WIN · ON-CHAIN</span></div>
          <div className="hero-card-float float-one"><b>A</b><strong>♠</strong></div>
          <div className="hero-card-float float-two"><b>K</b><strong>♦</strong></div>
          <div className="hero-verify"><i>!</i><span><small>ROUND PROOF</small><strong>REVIEW REQUIRED</strong></span></div>
        </div>
      </section>

      <GraduationBanner />

      <section className="cx-metrics">
        <div><small>TABLE PREVIEW</small><strong>Bingo</strong><span><StatusDot online={false} /> Read-only</span></div>
        <div><small>SETTLEMENT DESIGN</small><strong>On-chain</strong><span>Verification pending</span></div>
        <div><small>WALLET UI</small><strong>FleetWallet</strong><span>Signing disabled</span></div>
        <div><small>SOCIAL DESIGN</small><strong>Room chat</strong><span>Connection disabled</span></div>
      </section>
    </>
  )
}

function Games({ onPlay }) {
  const [filter, setFilter] = useState('All')
  const categories = ['All', 'Preview', 'Social', 'Table', 'Originals']
  const filtered = games.filter((game) => filter === 'All' || (filter === 'Preview' ? game.live : game.category === filter))

  return (
    <section className="cx-games" id="games">
      <div className="cx-section-heading">
        <div><span className="cx-eyebrow">THE CANASINO FLOOR</span><h2>Games designed to feel <em>alive.</em></h2></div>
        <p>Explore Bingo, Poker, Domino and Roulette table previews. Wagering is paused; Pool and Crash are coming soon.</p>
      </div>
      <div className="cx-filter-row" role="group" aria-label="Game categories">{categories.map((item) => <button className={filter === item ? 'active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
      <div className="cx-games-grid">{filtered.map((game) => <GameCard key={game.id} game={game} onPlay={onPlay} />)}</div>
    </section>
  )
}

const ROADMAP_PHASES = [
  {
    status: 'shipped',
    title: 'Roulette, Domino, Poker — built end to end',
    body: 'Game logic, on-chain economics, server and table UI for all three, each settled from an on-chain commit-reveal round.',
  },
  {
    status: 'progress',
    title: 'Fair-randomness-v2',
    body: 'Settlement moves from a bare operator-revealed seed to consensus-authenticated entropy: a bonded operator closes a round, a future block window finalizes before any outcome is derivable, and the plugin independently replays the result.',
  },
  {
    status: 'progress',
    title: 'Rolling out to the live validator',
    body: 'Shipping in stages so nothing on the real chain breaks mid-flight: Poker support first, the randomness upgrade once its consensus-level changes are proven safe end to end.',
  },
  {
    status: 'next',
    title: 'Security close-out before real money',
    body: 'An external security audit, signature verification on the auto-updater, and a final confirmation that every exposed credential has been rotated — the gate before any real-money launch.',
  },
  {
    status: 'future',
    title: 'Pool, Crash, and the rewards layer',
    body: 'Two more table games, plus rakeback, VIP progression, tournaments and cosmetic ownership — the retention layer for after launch.',
  },
]

const ROADMAP_STATUS_LABEL = { shipped: 'Shipped', progress: 'In progress', next: 'Next', future: 'Future' }

function Roadmap() {
  return (
    <section className="cx-roadmap" id="roadmap">
      <div className="cx-section-heading">
        <div><span className="cx-eyebrow">WHERE THINGS STAND</span><h2>Built in the open, <em>shipped in stages.</em></h2></div>
        <p>The graduation progress above funds Canasino's own chain. This is the product roadmap running alongside it — what's live, what's being rolled out carefully, and what's still ahead.</p>
      </div>
      <div className="roadmap-list">
        {ROADMAP_PHASES.map((phase) => (
          <div className={`roadmap-phase roadmap-${phase.status}`} key={phase.title}>
            <span className={`roadmap-pill roadmap-pill-${phase.status}`}>{ROADMAP_STATUS_LABEL[phase.status]}</span>
            <div className="roadmap-body">
              <h3>{phase.title}</h3>
              <p>{phase.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Fairness() {
  return (
    <section className="cx-fairness" id="fairness">
      <div className="fairness-copy">
        <span className="cx-eyebrow">PROVABLY FAIR · PRODUCT, NOT SLOGAN</span>
        <h2>The proof belongs <em>inside the game.</em></h2>
        <p>Canasino is designed to expose the cryptographic lifecycle next to each round. The current preview explains that model but does not claim to verify a live result.</p>
        <div className="fairness-steps">
          <div><b>01</b><span><strong>Commit</strong><small>Round commitment is published before the result.</small></span></div>
          <div><b>02</b><span><strong>Play</strong><small>The player joins from a self-custody wallet.</small></span></div>
          <div><b>03</b><span><strong>Reveal</strong><small>Round data becomes inspectable after play.</small></span></div>
          <div><b>04</b><span><strong>Settle</strong><small>Winner and payout state are linked to chain settlement.</small></span></div>
        </div>
      </div>
      <div className="proof-demo">
        <div className="proof-demo-head"><span><i aria-hidden="true">◇</i><span><small>CANASINO</small><strong>How round proofs work</strong></span></span><b>EXAMPLE ONLY</b></div>
        <label><span>Commitment</span><div>Published before play</div></label>
        <div className="proof-demo-grid"><label><span>Chain</span><div>Canopy</div></label><label><span>Status</span><div>Not verified</div></label></div>
        <div className="proof-code"><span>verification requires</span><strong>commitment + reveal + round</strong></div>
        <p>This is an illustration, not a verified result. A future live room must verify the commitment, reveal, round rules and successful on-chain settlement—not merely display data from the game service.</p>
      </div>
    </section>
  )
}

function Rewards() {
  /** @type {[typeof IconCoinLoop, string, string][]} */
  const layers = [
    [IconCoinLoop, 'Rakeback', 'Transparent rewards based on verified activity.'],
    [IconStarBadge, 'VIP', 'Progression that can follow the wallet, not a hidden account.'],
    [IconBracket, 'Tournaments', 'Community competition with visible prize pools.'],
    [IconSparkle, 'Cosmetics', 'Ownable identity around cards, tables and profiles.'],
  ]
  return (
    <section className="cx-rewards" id="rewards">
      <div className="cx-section-heading"><div><span className="cx-eyebrow">CASN ECOSYSTEM</span><h2>Reward the player, <em>not the opacity.</em></h2></div><p>Rakeback, tournaments, achievements and cosmetic ownership can grow around verified gameplay without contaminating the core round logic.</p></div>
      <div className="reward-list">
        {layers.map(([Icon, title, text], index) => (
          <div className="reward-row" key={title}>
            <span className="reward-index">{String(index + 1).padStart(2, '0')}</span>
            <i><Icon /></i>
            <div><strong>{title}</strong><p>{text}</p></div>
            <span className="reward-status">Planned</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function Experience() {
  const [view, setView] = useState('casino')
  const [active, setActive] = useState('home')
  const [account, setAccount] = useState(null)
  const [balance, setBalance] = useState(null)
  const [walletState, setWalletState] = useState('idle')
  const [walletNotice, setWalletNotice] = useState('')
  const walletEpoch = useRef(0)
  const connectingRef = useRef(false)

  useEffect(() => {
    let alive = true
    const epoch = walletEpoch.current
    ;(async () => {
      await waitForFleet()
      const restored = await restoreFleet()
      if (!alive || !restored || walletEpoch.current !== epoch) return
      setAccount(restored)
      const restoredBalance = await getFleetBalance()
      if (alive && walletEpoch.current === epoch) setBalance(restoredBalance)
    })()
    return () => { alive = false }
  }, [])

  async function connect() {
    if (connectingRef.current) return
    setWalletNotice('')
    if (!hasFleet()) {
      setWalletNotice('FleetWallet is not detected in this browser. Install or enable the extension to use self-custody play.')
      return
    }

    connectingRef.current = true
    const epoch = ++walletEpoch.current
    setWalletState('connecting')
    try {
      const next = await connectFleet()
      if (walletEpoch.current !== epoch) return
      if (!next) throw new Error('No wallet account was selected.')
      setAccount(next)
      const nextBalance = await getFleetBalance()
      if (walletEpoch.current === epoch) setBalance(nextBalance)
    } catch (error) {
      setWalletNotice(error?.message || 'Wallet connection failed.')
    } finally {
      connectingRef.current = false
      setWalletState('idle')
    }
  }

  async function refreshBalance() {
    const epoch = walletEpoch.current
    const next = await getFleetBalance()
    if (walletEpoch.current === epoch && next) setBalance(next)
  }

  async function disconnect() {
    walletEpoch.current++
    setAccount(null)
    setBalance(null)
    await disconnectFleet()
  }

  function play(game) {
    if (!['bingo', 'roulette', 'domino', 'poker'].includes(game.id)) return
    setView(game.id)
    setActive('rooms')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function navigate(id) {
    if (id === 'rooms') {
      play(games[0])
      return
    }
    setView('casino')
    setActive(id)
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
  }

  return (
    <div className="cx-app">
      <div className="cx-noise" />
      <a className="cx-skip-link" href="#main-content">Skip to main content</a>
      <aside className="cx-sidebar">
        <button className="cx-logo-button" aria-label="Canasino home" onClick={() => navigate('home')}><Logo compact /></button>
        <nav aria-label="Main navigation">{nav.map(([id, Icon, label]) => <button className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} key={id} onClick={() => navigate(id)} title={label}><span><Icon /></span><small>{label}</small></button>)}</nav>
        <div className="sidebar-bottom"><a href="https://github.com/infoboy27/canasino" target="_blank" rel="noreferrer" aria-label="Canasino on GitHub" title="GitHub"><IconGithub /></a><a href="#responsible-play" title="Responsible play">18+</a></div>
      </aside>

      <div className="cx-page">
        <header className="cx-header">
          <button className="mobile-brand" aria-label="Canasino home" onClick={() => navigate('home')}><Logo /></button>
          <div className="desktop-header-brand"><Logo /></div>
          <div className="cx-header-center"><button className={view === 'casino' ? 'active' : ''} onClick={() => navigate('home')}>Casino</button><button className={view === 'bingo' ? 'active' : ''} onClick={() => play(games[0])}>Bingo Preview <StatusDot online={false} /></button><button className={view === 'roulette' ? 'active' : ''} onClick={() => play(games.find((game) => game.id === 'roulette'))}>Roulette Preview <StatusDot online={false} /></button><button className={view === 'domino' ? 'active' : ''} onClick={() => play(games.find((game) => game.id === 'domino'))}>Domino Preview <StatusDot online={false} /></button><button className={view === 'poker' ? 'active' : ''} onClick={() => play(games.find((game) => game.id === 'poker'))}>Poker Preview <StatusDot online={false} /></button><button onClick={() => navigate('fairness')}>Fairness</button></div>
          <WalletButton account={account} balance={balance} onConnect={connect} onDisconnect={disconnect} connecting={walletState === 'connecting'} />
        </header>

        {walletNotice && <div className="cx-wallet-notice" role="alert"><span>!</span><p>{walletNotice}</p><button aria-label="Dismiss wallet notice" onClick={() => setWalletNotice('')}>×</button></div>}

        <main id="main-content" tabIndex={-1}>
          {WAGERING_PAUSED && <div className="cx-safety-banner" role="status"><strong>Wagering paused · Preview available</strong><p>{PAUSE_MESSAGE}</p></div>}
          {view === 'bingo' ? (
            <LiveRoom key={account?.address || 'guest'} account={account} onConnect={connect} walletBalance={balance} refreshBalance={refreshBalance} />
          ) : view === 'roulette' ? (
            <RouletteRoom key={account?.address || 'guest'} account={account} onConnect={connect} walletBalance={balance} refreshBalance={refreshBalance} />
          ) : view === 'domino' ? (
            <DominoRoom key={account?.address || 'guest'} account={account} onConnect={connect} refreshBalance={refreshBalance} />
          ) : view === 'poker' ? (
            <PokerRoom key={account?.address || 'guest'} account={account} onConnect={connect} refreshBalance={refreshBalance} />
          ) : (
            <>
              <Home onPlay={play} />
              <Games onPlay={play} />
              <Roadmap />
              <Fairness />
              <Rewards />
            </>
          )}
        </main>

        <footer className="cx-footer">
          <Logo />
          <p id="responsible-play">Canasino is a Canopy ecosystem gaming interface. Gambling can result in loss of funds. Set limits, take breaks and only play what you can afford to lose. Adults only, where permitted.</p>
          <div><button className="footer-link" onClick={() => navigate('fairness')}>Provably Fair</button><a href="https://github.com/infoboy27/canasino" target="_blank" rel="noreferrer">GitHub</a></div>
        </footer>

        <nav className="cx-mobile-nav" aria-label="Mobile navigation">{nav.slice(0, 4).map(([id, Icon, label]) => <button className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined} key={id} onClick={() => navigate(id)}><span><Icon /></span><small>{label}</small></button>)}</nav>
      </div>
    </div>
  )
}
