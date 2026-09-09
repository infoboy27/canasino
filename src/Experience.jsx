import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTokens, parseTokens, wireAmount } from './lib/amounts.js'
import { assertCanAfford } from './lib/api.js'
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
  getPokerHand,
  getPokerProof,
  getPokerRound,
  getPokerRoundInfo,
  openPokerRound,
  openPokerSocket,
  postPokerAction,
  registerPokerJoin,
} from './lib/poker'
import { IconBracket, IconBroadcast, IconChip, IconCoinLoop, IconGithub, IconHome, IconLaurel, IconShieldCheck, IconSparkle, IconStarBadge } from './lib/icons'
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

function BingoCard({ card = [], balls = [] }) {
  if (!Array.isArray(card) || card.length === 0) {
    return (
      <div className="cx-card-placeholder">
        <div className="placeholder-grid">{Array.from({ length: 25 }).map((_, index) => <span key={index} />)}</div>
        <strong>Your card appears after a confirmed entry</strong>
        <p>Numbers come from the game server only after the wallet-signed join is registered.</p>
      </div>
    )
  }

  const flatBalls = new Set(balls.map((ball) => Number(ball.number ?? ball)))
  const matrix = Array.isArray(card[0]) ? card : [card]

  return (
    <div className="cx-bingo-card">
      <div className="bingo-head">{['B', 'I', 'N', 'G', 'O'].map((letter) => <b key={letter}>{letter}</b>)}</div>
      <div className="bingo-grid">
        {matrix.flat().slice(0, 25).map((number, index) => {
          const free = index === 12
          const hit = free || flatBalls.has(Number(number))
          return <span role="img" aria-label={free ? 'Free space, marked' : `${number}${hit ? ', marked' : ''}`} className={hit ? 'hit' : ''} key={`${number}-${index}`}>{free ? '★' : number}</span>
        })}
      </div>
    </div>
  )
}

function RouletteWheel({ spinPhase, spinNumber }) {
  const [rotation, setRotation] = useState(0)
  const spinningRef = useRef(false)

  useEffect(() => {
    if (spinPhase !== 'spinning') { spinningRef.current = false; return undefined }
    spinningRef.current = true
    let raf
    const tick = () => {
      if (!spinningRef.current) return
      setRotation((value) => value + 7)
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => { spinningRef.current = false; window.cancelAnimationFrame(raf) }
  }, [spinPhase])

  useEffect(() => {
    if (spinPhase !== 'settled' || spinNumber == null) return
    spinningRef.current = false
    const pocketIndex = WHEEL_ORDER.indexOf(spinNumber)
    setRotation((value) => (value - (value % 360)) + 4 * 360 - pocketIndex * POCKET_ANGLE)
  }, [spinPhase, spinNumber])

  return (
    <div className="rw-wheel-wrap">
      <span className="rw-pointer" aria-hidden="true" />
      <div
        className="rw-disc"
        style={{
          background: `conic-gradient(${WHEEL_GRADIENT})`,
          transform: `rotate(${rotation}deg)`,
          transition: spinPhase === 'settled' ? 'transform 4.2s cubic-bezier(.12,.83,.19,1)' : 'none',
        }}
        aria-hidden="true"
      >
        {WHEEL_ORDER.map((number, index) => {
          const angle = index * POCKET_ANGLE + POCKET_ANGLE / 2
          return (
            <span
              className={`rw-pocket-label ${colorOf(number)}`}
              key={number}
              style={{ transform: `rotate(${angle}deg) translateY(-96px) rotate(${-angle}deg)` }}
            >
              {number}
            </span>
          )
        })}
      </div>
      <div className={`rw-hub ${colorOf(spinNumber ?? -1)} ${spinPhase === 'settled' ? 'has-result' : ''}`}>
        <strong>{spinPhase === 'settled' && spinNumber != null ? spinNumber : '—'}</strong>
      </div>
    </div>
  )
}

function BettingTable({ selectedBet, onSelect, disabled }) {
  const isSelected = (type, number) => selectedBet?.type === type && (type !== 'straight' || selectedBet?.number === number)
  const cellClass = (type, number) => `rw-cell ${type === 'straight' ? (number === 0 ? 'zero' : colorOf(number)) : ''} ${isSelected(type, number) ? 'selected' : ''}`

  return (
    <div className={`rw-table ${disabled ? 'is-disabled' : ''}`}>
      <p className="rw-scroll-hint">Swipe horizontally to inspect the full table.</p>
      <div className="rw-grid">
        <button type="button" className={cellClass('straight', 0)} aria-label="Straight 0" aria-pressed={isSelected('straight', 0)} onClick={() => onSelect('straight', 0)} disabled={disabled}>0</button>
        <div className="rw-grid-body">
          {TABLE_ROWS.map((row) => (
            <div className="rw-grid-row" key={row.bet}>
              {row.numbers.map((number) => (
                <button type="button" key={number} className={cellClass('straight', number)} aria-label={`Straight ${number}`} aria-pressed={isSelected('straight', number)} onClick={() => onSelect('straight', number)} disabled={disabled}>
                  {number}
                </button>
              ))}
              <button type="button" className={`rw-cell rw-col-bet ${isSelected(row.bet) ? 'selected' : ''}`} aria-label={`Column ${row.bet.slice(-1)}, pays 2 to 1`} aria-pressed={isSelected(row.bet)} onClick={() => onSelect(row.bet)} disabled={disabled}>2:1</button>
            </div>
          ))}
        </div>
      </div>
      <div className="rw-outside">
        <button type="button" className={`rw-cell ${isSelected('dozen1') ? 'selected' : ''}`} aria-pressed={isSelected('dozen1')} onClick={() => onSelect('dozen1')} disabled={disabled}>1st 12</button>
        <button type="button" className={`rw-cell ${isSelected('dozen2') ? 'selected' : ''}`} aria-pressed={isSelected('dozen2')} onClick={() => onSelect('dozen2')} disabled={disabled}>2nd 12</button>
        <button type="button" className={`rw-cell ${isSelected('dozen3') ? 'selected' : ''}`} aria-pressed={isSelected('dozen3')} onClick={() => onSelect('dozen3')} disabled={disabled}>3rd 12</button>
      </div>
      <div className="rw-outside rw-outside-even">
        <button type="button" className={`rw-cell ${isSelected('low') ? 'selected' : ''}`} aria-pressed={isSelected('low')} onClick={() => onSelect('low')} disabled={disabled}>1–18</button>
        <button type="button" className={`rw-cell ${isSelected('even') ? 'selected' : ''}`} aria-pressed={isSelected('even')} onClick={() => onSelect('even')} disabled={disabled}>Even</button>
        <button type="button" className={`rw-cell red ${isSelected('red') ? 'selected' : ''}`} aria-pressed={isSelected('red')} onClick={() => onSelect('red')} disabled={disabled}>Red</button>
        <button type="button" className={`rw-cell black ${isSelected('black') ? 'selected' : ''}`} aria-pressed={isSelected('black')} onClick={() => onSelect('black')} disabled={disabled}>Black</button>
        <button type="button" className={`rw-cell ${isSelected('odd') ? 'selected' : ''}`} aria-pressed={isSelected('odd')} onClick={() => onSelect('odd')} disabled={disabled}>Odd</button>
        <button type="button" className={`rw-cell ${isSelected('high') ? 'selected' : ''}`} aria-pressed={isSelected('high')} onClick={() => onSelect('high')} disabled={disabled}>19–36</button>
      </div>
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

function DominoTile({ tile = null, faceDown = false, orientation = 'horizontal', selected = false, disabled = false, onClick = () => {} }) {
  if (faceDown) return <div className={`dm-tile face-down ${orientation}`} />
  const [low, high] = tile
  return (
    <button
      type="button"
      className={`dm-tile ${orientation} ${selected ? 'selected' : ''}`}
      aria-label={`Domino ${low} and ${high}`}
      aria-pressed={Boolean(selected)}
      disabled={disabled}
      onClick={onClick}
    >
      <DominoPips value={low} /><i /><DominoPips value={high} />
    </button>
  )
}

const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' }

function PlayingCard({ card = null, faceDown = false }) {
  if (faceDown || !card) return <div className="pk-card face-down" role="img" aria-label="Face-down playing card" />
  const [rank, suit] = card
  const red = suit === 'h' || suit === 'd'
  return (
    <div className={`pk-card ${red ? 'red' : 'black'}`} role="img" aria-label={`${rank} of ${suit}`}>
      <span className="pk-card-rank">{rank}</span>
      <span className="pk-card-suit">{SUIT_SYMBOL[suit] || suit}</span>
    </div>
  )
}

function ChatPanel({ messages, value, onChange, onSend, connected, account, mobileClose = null, panelId = undefined }) {
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
        <input aria-label="Message the room" value={value} onChange={(event) => onChange(event.target.value)} placeholder={account ? 'Message the room…' : 'Connect wallet to chat'} disabled={!connected || !account} maxLength={240} />
        <button disabled={!connected || !account || !value.trim()} aria-label="Send message">↑</button>
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

function LiveRoom({ account, onConnect, walletBalance }) {
  const [rooms, setRooms] = useState([])
  const [roomsState, setRoomsState] = useState('loading')
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [numCards, setNumCards] = useState(1)
  const [round, setRound] = useState(null)
  const [roundInfo, setRoundInfo] = useState(null)
  const [phase, setPhase] = useState('idle')
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

  useEffect(() => {
    if (!round?.roundId) return undefined

    const roomId = round.roundId
    let roundWs
    let chatWs

    try {
      roundWs = openRoundSocket(roomId)
      roundSocketRef.current = roundWs
      roundWs.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'ball') setBalls((current) => [...current, message])
          if (message.type === 'bingo' || message.type === 'settled') {
            setResult(message)
            if (message.type === 'settled') setPhase('confirmed')
          }
        } catch {
          // Ignore malformed socket messages instead of breaking the game surface.
        }
      }

      chatWs = openChatSocket(roomId)
      chatSocketRef.current = chatWs
      chatWs.onopen = () => setChatConnected(true)
      chatWs.onclose = () => setChatConnected(false)
      chatWs.onerror = () => setChatConnected(false)
      chatWs.onmessage = (event) => {
        try {
          const incoming = JSON.parse(event.data)
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
      roundWs?.close()
      chatWs?.close()
      roundSocketRef.current = null
      chatSocketRef.current = null
    }
  }, [round?.roundId])

  const amount = useMemo(() => entryCost(roundInfo?.entryFee ?? selectedRoom?.entryFee ?? 0, numCards), [roundInfo, selectedRoom, numCards])
  const latestBall = balls[balls.length - 1]
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
    if (!selectedRoom) return
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
      const hash = signed?.txHash || ''
      setTxHash(hash)
      setPhase('submitted')

      // The join tx needs a block to be indexed and reach finality before the
      // server can verify it; give it a moment, then retry once on 425.
      await new Promise((resolve) => setTimeout(resolve, 3500))
      try {
        await registerRound(round.roundId, account.address, numCards, hash)
      } catch (registerErr) {
        if (registerErr?.status !== 425) throw registerErr
        await new Promise((resolve) => setTimeout(resolve, 5000))
        await registerRound(round.roundId, account.address, numCards, hash)
      }
      setPhase('confirmed')
      getRoundProof(round.roundId).then(setProof).catch(() => null)

      // Cards are dealt from the FINAL seed (revealed secret folded with the
      // consensus entropy fixed at close), so they only exist once the round
      // has closed and its entropy window has finalized. Poll until then.
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          const cardResponse = await getCard(round.roundId, account.address, numCards)
          setCards(cardResponse.cards || [])
          break
        } catch (cardErr) {
          if (cardErr?.status !== 425) throw cardErr
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      }
    } catch (err) {
      if (err?.code === WALLET_METHOD_MISSING || err?.message === WALLET_METHOD_MISSING) {
        setError('This FleetWallet build does not expose canopy_signAndSubmit yet. Update FleetWallet before playing with real value.')
      } else {
        setError(err?.message || 'The room entry failed.')
      }
      setPhase('round-ready')
    }
  }

  function sendChat(event) {
    event.preventDefault()
    const text = chatText.trim()
    if (!text || !account || !chatConnected || chatSocketRef.current?.readyState !== WebSocket.OPEN) return
    chatSocketRef.current.send(JSON.stringify({ type: 'chat', user: shortAddress(account.address), text }))
    setChatText('')
  }

  return (
    <section className="cx-live-room" id="rooms">
      <div className="room-ambient ambient-one" />
      <div className="room-ambient ambient-two" />

      <div className="cx-room-main">
        <div className="cx-room-heading">
          <div>
            <span className="cx-eyebrow"><StatusDot online={false} /> BINGO · READ-ONLY PREVIEW</span>
            <h1>Explore the <em>gold room.</em></h1>
            <p>Inspect the table and wallet flow. Creating rounds, signing entries and live chat remain disabled during the security review.</p>
          </div>
        </div>

        <div className="cx-room-layout">
          <div className="cx-game-stage">
            <div className="stage-topbar">
              <div><span className="table-badge"><StatusDot online={false} /> PREVIEW TABLE</span><strong>{selectedRoom?.name || 'Bingo room'}</strong></div>
              <button className="mobile-chat-toggle" aria-expanded={chatOpen} aria-controls="mobile-room-chat" onClick={() => setChatOpen(true)}>Chat <span>{messages.filter((m) => m.type !== 'system').length}</span></button>
            </div>

            <div className="ball-stage">
              <div className={`draw-machine ${latestBall ? 'has-ball' : ''}`}>
                <span className="machine-ring ring-1" />
                <span className="machine-ring ring-2" />
                <div className="draw-ball">
                  {latestBall ? <><small>{latestBall.letter || ''}</small><strong>{latestBall.number}</strong></> : <><small>ROUND</small><strong>{round ? 'DATA' : '—'}</strong></>}
                </div>
              </div>
              <div className="draw-copy">
                <span className="cx-eyebrow">CURRENT DRAW</span>
                <h2>{latestBall ? `${latestBall.letter || ''}${latestBall.number}` : round ? 'Waiting for draw' : 'Create a room'}</h2>
                <p>{round ? `${balls.length} balls reported by the round socket.` : 'Select a room below to inspect its preview.'}</p>
              </div>
              <div className="recent-balls">
                {balls.slice(-8).reverse().map((ball, index) => <span className={index === 0 ? 'latest' : ''} key={`${ball.index ?? index}-${ball.number}`}>{ball.letter}{ball.number}</span>)}
                {balls.length === 0 && Array.from({ length: 5 }).map((_, index) => <span className="ghost" key={index}>•</span>)}
              </div>
            </div>

            <div className="player-surface">
              <div className="card-area">
                <div className="surface-title"><span><small>YOUR CARD</small><strong>{account ? shortAddress(account.address) : 'Wallet not connected'}</strong></span>{cards.length > 1 && <b>{cards.length} cards</b>}</div>
                {cards.length ? cards.map((card, index) => <div className="bingo-card-entry" key={index}><p className="card-number">Card {index + 1} of {cards.length}</p><BingoCard card={card} balls={balls} /></div>) : <BingoCard balls={balls} />}
              </div>
              <div className="round-side">
                <TxStatus phase={phase} error={error} txHash={txHash} />
                {result && (
                  <div className={`result-card ${result.winners?.includes(account?.address) ? 'is-win' : ''}`}>
                    <span className="cx-eyebrow">ROUND RESULT</span>
                    <strong>{result.winners?.includes(account?.address) ? 'You won' : 'Round settled'}</strong>
                    <p>{Array.isArray(result.winners) && result.winners.length ? `${result.winners.length} winner${result.winners.length > 1 ? 's' : ''} reported by the game service.` : 'Settlement reported by the game service.'}</p>
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

          <ChatPanel messages={messages} value={chatText} onChange={setChatText} onSend={sendChat} connected={chatConnected} account={account} />
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
              <button className="cx-gold-button" onClick={handleCreateRoom} disabled={WAGERING_PAUSED || !selectedRoom || roomsState !== 'ready'}><span>{WAGERING_PAUSED ? 'Unavailable during audit' : 'Create room'}</span><b>→</b></button>
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

      {chatOpen && <MobileChatDialog onClose={() => setChatOpen(false)}><ChatPanel panelId="mobile-room-chat" messages={messages} value={chatText} onChange={setChatText} onSend={sendChat} connected={chatConnected} account={account} mobileClose={() => setChatOpen(false)} /></MobileChatDialog>}
    </section>
  )
}

// Backend note: each round is opened fresh on request (no shared, continuously-
// spinning table yet -- see the roadmap memory on this trade-off). This
// component papers over that by auto-opening the next round a few seconds
// after each settle, so the table reads as "always live" from the player's
// side without needing a backend change.
const ROULETTE_AUTO_RESPIN_MS = 6_000

function RouletteRoom({ account, onConnect, walletBalance }) {
  const [roundId, setRoundId] = useState(null)
  const [, setRoundMeta] = useState(null)
  const [roundInfo, setRoundInfo] = useState(null)
  const [openError, setOpenError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(null)
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

  async function startNewRound() {
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
    return () => window.clearTimeout(respinTimerRef.current)
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
          if (message.type === 'tick') setSecondsLeft(message.secondsLeft)
          if (message.type === 'spinning') { setSecondsLeft(0); setSpinPhase('spinning') }
          if (message.type === 'settled') {
            setSpinPhase('settled')
            setSpinResult(message)
            getRouletteProof(roundId).then(setProof).catch(() => null)
            respinTimerRef.current = window.setTimeout(startNewRound, ROULETTE_AUTO_RESPIN_MS)
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

  const betsOpen = phase !== 'idle' && spinPhase === 'waiting' && (secondsLeft == null || secondsLeft > 0)
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
      await registerRouletteBet(roundId, account.address, selectedBet.type, selectedBet.number || 0, amount, signed?.txHash)
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
  const won = myPayout != null && myPayout > 0

  return (
    <section className="cx-live-room rw-room" id="rooms">
      <div className="room-ambient ambient-one" />
      <div className="room-ambient ambient-two" />

      <div className="cx-room-main">
        <div className="cx-room-heading">
          <div>
            <span className="cx-eyebrow"><StatusDot online={false} /> ROULETTE · READ-ONLY PREVIEW</span>
            <h1>Spin the <em>wheel.</em></h1>
            <p>European single-zero wheel. The operator commits to a hidden seed before the table opens; the spin is derived from it and only revealed at settle.</p>
          </div>
        </div>

        <div className="cx-room-layout rw-layout">
          <div className="cx-game-stage rw-stage">
            <div className="rw-stage-top">
              <RouletteWheel spinPhase={spinPhase} spinNumber={spinResult?.spin} />
              <div className="rw-status-copy">
                <span className="cx-eyebrow">
                  {WAGERING_PAUSED ? 'TABLE PREVIEW' : spinPhase === 'spinning' ? 'SPINNING' : spinPhase === 'settled' ? 'RESULT' : 'BETS OPEN'}
                </span>
                <h2>
                  {WAGERING_PAUSED ? 'Wagering paused' : spinPhase === 'settled' && spinResult
                    ? `${spinResult.spin} ${spinResult.color}`
                    : spinPhase === 'spinning'
                    ? 'No more bets'
                    : secondsLeft != null ? `${secondsLeft}s to place a bet` : 'Opening the table…'}
                </h2>
                <p>
                  {WAGERING_PAUSED ? 'Explore the wheel layout. No round or transaction will be created.' : spinPhase === 'settled'
                    ? `Table respins in a few seconds — proof is on the right.`
                    : myBet
                    ? `Your bet: ${betLabel(myBet)} · ${cnpy(myBet.amount)} CNPY`
                    : 'Pick a number or an outside bet below, then place it before the countdown ends.'}
                </p>
                {openError && <p className="error-copy">{openError}</p>}
              </div>
            </div>

            <BettingTable selectedBet={selectedBet} onSelect={(type, number = 0) => betsOpen && !myBet && setSelectedBet({ type, number })} disabled={!betsOpen || Boolean(myBet)} />

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
            {spinPhase === 'settled' && spinResult && myBet && (
              <div className={`result-card ${won ? 'is-win' : ''}`}>
                <span className="cx-eyebrow">ROUND RESULT</span>
                <strong>{won ? 'You won' : 'No luck this spin'}</strong>
                <p>
                  {spinResult.spin} {spinResult.color} · {won
                    ? `+${cnpy(myPayout)} CNPY net of rake.`
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

function legalDominoEnds(tile, ends) {
  if (!ends) return ['none']
  const [left, right] = ends
  const [a, b] = tile
  const outs = []
  if (a === left || b === left) outs.push('left')
  if (a === right || b === right) outs.push('right')
  return outs
}

function DominoRoom({ account, onConnect }) {
  const [mode, setMode] = useState('lobby') // lobby -> waiting -> playing -> settled
  const [roundId, setRoundId] = useState(null)
  const [roundInfo, setRoundInfo] = useState(null)
  const [mySeat, setMySeat] = useState(null)
  const [, setPlayers] = useState([])
  const [myHand, setMyHand] = useState([])
  const [ends, setEnds] = useState(null)
  const [turn, setTurn] = useState(null)
  const [boneyardRemaining, setBoneyardRemaining] = useState(null)
  const [joinInput, setJoinInput] = useState('')
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [selectedTile, setSelectedTile] = useState(null)
  const [result, setResult] = useState(null)
  const [proof, setProof] = useState(null)
  const socketRef = useRef(null)

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
          }
          if (msg.type === 'settled') {
            setMode('settled')
            setResult(msg)
            getDominoProof(roundId).then(setProof).catch(() => null)
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

  async function performJoin(rid, info) {
    if (!account) { onConnect(); return false }
    try {
      await assertCanAfford(account.address, info.entryFee + 10000, 'this table')
      setPhase('awaiting-signature')
      const signed = await joinDominoTable({
        roundId: rid, amount: info.entryFee, rpcUrl: info.rpcUrl, chainId: info.chainId, networkId: info.networkId,
      })
      setTxHash(signed?.txHash || '')
      setPhase('submitted')
      await new Promise((resolve) => setTimeout(resolve, 3500))
      try {
        await registerDominoJoin(rid, account.address, signed?.txHash)
      } catch (regErr) {
        if (regErr?.status !== 425) throw regErr
        await new Promise((resolve) => setTimeout(resolve, 5000))
        await registerDominoJoin(rid, account.address, signed?.txHash)
      }
      for (let attempt = 0; attempt < 40; attempt++) {
        try { const hand = await getDominoHand(rid, account.address); setMyHand(hand.hand); break }
        catch (hErr) { if (hErr?.status !== 425) throw hErr; await new Promise((r) => setTimeout(r, 3000)) }
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
      const created = await openDominoRound()
      const rid = created.roundId
      const info = await getDominoRoundInfo(rid)
      const infoObj = {
        entryFee: wireAmount(info.entryFee), rakeBps: wireAmount(info.rakeBps),
        chainId: wireAmount(info.chainId), networkId: wireAmount(info.networkId), rpcUrl: info.rpcUrl,
      }
      setRoundId(rid); setRoundInfo(infoObj); setPhase('round-ready')
      const ok = await performJoin(rid, infoObj)
      if (ok) { setMySeat(0); setPlayers([account.address]); setMode('waiting') }
    } catch (err) {
      setError(`Could not open a table: ${err.message}`)
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
      setRoundId(rid); setRoundInfo(infoObj); setPhase('round-ready')
      const ok = await performJoin(rid, infoObj)
      if (ok) { setMySeat(1); setMode('playing') }
    } catch (err) {
      setError(err?.message || 'Could not find that table.')
    }
  }

  async function submitMove(action, tile, end) {
    setError('')
    try {
      const resp = await postDominoMove(roundId, account.address, action, tile, end)
      if (action === 'play') {
        setMyHand((hand) => hand.filter((t) => !(t[0] === tile[0] && t[1] === tile[1])))
      } else if (action === 'draw') {
        const hand = await getDominoHand(roundId, account.address)
        setMyHand(hand.hand)
      }
      setSelectedTile(null)
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

  const myTurn = mode === 'playing' && turn === mySeat
  const hasLegalPlay = myHand.some((t) => legalDominoEnds(t, ends).length > 0)
  const opponentHandSize = 7 // face-down count is cosmetic; exact remaining count isn't exposed pre-settle
  const myPayout = result && account ? result.payouts?.[account.address] : null
  const won = myPayout != null && myPayout > 0

  return (
    <section className="cx-live-room dm-room" id="rooms">
      <div className="room-ambient ambient-one" />
      <div className="room-ambient ambient-two" />

      <div className="cx-room-main">
        <div className="cx-room-heading">
          <div>
            <span className="cx-eyebrow"><StatusDot online={false} /> DOMINO · READ-ONLY PREVIEW</span>
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
            <div className="cx-game-stage dm-stage">
              <div className="dm-opponent-row">
                <span className="cx-eyebrow">OPPONENT</span>
                <div className="dm-hand face-down-row">
                  {mode === 'waiting'
                    ? <p className="dm-waiting-copy">Waiting for an opponent to join table <code>{roundId?.slice(0, 12)}…</code></p>
                    : Array.from({ length: opponentHandSize }).map((_, index) => <DominoTile key={index} faceDown />)}
                </div>
              </div>

              <div className="dm-board">
                {ends == null && mode === 'playing' && <span className="dm-board-hint">Table is empty — play any tile to open it.</span>}
                {ends != null && (
                  <div className="dm-board-line">
                    <span className="dm-end-label">{ends[0]}</span>
                    <span className="dm-board-strip" />
                    <span className="dm-end-label">{ends[1]}</span>
                  </div>
                )}
                {mode === 'playing' && (
                  <p className="dm-turn-copy">{myTurn ? 'Your turn' : "Opponent's turn"} · {boneyardRemaining ?? '—'} tiles left in the boneyard</p>
                )}
              </div>

              <div className="dm-hand-row">
                <span className="cx-eyebrow">YOUR HAND</span>
                <div className="dm-hand">
                  {myHand.map((tile, index) => (
                    <DominoTile
                      key={`${tile[0]}-${tile[1]}-${index}`}
                      tile={tile}
                      selected={selectedTile && selectedTile[0] === tile[0] && selectedTile[1] === tile[1]}
                      disabled={!myTurn || legalDominoEnds(tile, ends).length === 0}
                      onClick={() => handleTileClick(tile)}
                    />
                  ))}
                </div>
                {selectedTile && (
                  <div className="dm-end-choice">
                    <span>Play {selectedTile[0]}|{selectedTile[1]} on which end?</span>
                    <button onClick={() => submitMove('play', selectedTile, 'left')}>Left ({ends[0]})</button>
                    <button onClick={() => submitMove('play', selectedTile, 'right')}>Right ({ends[1]})</button>
                  </div>
                )}
                {myTurn && !hasLegalPlay && (
                  <button className="cx-gold-button dm-draw-button" onClick={() => submitMove(boneyardRemaining > 0 ? 'draw' : 'pass')}>
                    <span>{boneyardRemaining > 0 ? 'Draw a tile' : 'Pass'}</span><b>→</b>
                  </button>
                )}
              </div>
            </div>

            <div className="round-side dm-side">
              <TxStatus phase={phase} error={error} txHash={txHash} />
              {mode === 'settled' && result && (
                <div className={`result-card ${won ? 'is-win' : ''}`}>
                  <span className="cx-eyebrow">ROUND RESULT</span>
                  <strong>{won ? 'You won' : 'No luck this game'}</strong>
                  <p>{result.reason === 'blocked' ? 'Table blocked' : 'Hand emptied'} · {won ? `+${cnpy(myPayout)} CNPY net of rake.` : 'Better luck at the next table.'}</p>
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

function PokerRoom({ account, onConnect }) {
  const [mode, setMode] = useState('lobby') // lobby -> waiting -> playing -> settled
  const [roundId, setRoundId] = useState(null)
  const [roundInfo, setRoundInfo] = useState(null)
  const [mySeat, setMySeat] = useState(null)
  const [, setPlayers] = useState([])
  const [myHole, setMyHole] = useState([])
  const [table, setTable] = useState({
    turn: null, street: null, board: [], pot: 0,
    streetContributed: [0, 0], stacks: [0, 0], folded: [false, false], allIn: [false, false], finished: false,
  })
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

  async function performJoin(rid, info) {
    if (!account) { onConnect(); return false }
    try {
      await assertCanAfford(account.address, info.buyIn + 10000, 'this table buy-in')
      setPhase('awaiting-signature')
      const signed = await joinPokerTable({
        roundId: rid, amount: info.buyIn, rpcUrl: info.rpcUrl, chainId: info.chainId, networkId: info.networkId,
      })
      setTxHash(signed?.txHash || '')
      setPhase('submitted')
      await new Promise((resolve) => setTimeout(resolve, 3500))
      try {
        await registerPokerJoin(rid, account.address, signed?.txHash)
      } catch (regErr) {
        if (regErr?.status !== 425) throw regErr
        await new Promise((resolve) => setTimeout(resolve, 5000))
        await registerPokerJoin(rid, account.address, signed?.txHash)
      }
      for (let attempt = 0; attempt < 40; attempt++) {
        try { const hole = await getPokerHand(rid, account.address); setMyHole(hole.hole); break }
        catch (hErr) { if (hErr?.status !== 425) throw hErr; await new Promise((r) => setTimeout(r, 3000)) }
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
      const created = await openPokerRound()
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
      const ok = await performJoin(rid, infoObj)
      if (ok) { setMySeat(1); setMode('playing') }
    } catch (err) {
      setError(err?.message || 'Could not find that table.')
    }
  }

  async function submitAction(action, amount = 0) {
    setError('')
    try {
      const resp = await postPokerAction(roundId, account.address, action, amount)
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
  const myTurn = mode === 'playing' && table.turn === mySeat
  const maxStreetContributed = Math.max(...table.streetContributed)
  const toCall = mySeat != null ? Math.max(0, maxStreetContributed - (table.streetContributed[mySeat] || 0)) : 0
  const suggestedRaiseTo = roundInfo ? (maxStreetContributed + roundInfo.bigBlind) / 1_000_000 : ''
  const myPayout = result && account ? result.payouts?.[account.address] : null
  const won = myPayout != null && myPayout > 0

  return (
    <section className="cx-live-room pk-room" id="rooms">
      <div className="room-ambient ambient-one" />
      <div className="room-ambient ambient-two" />

      <div className="cx-room-main">
        <div className="cx-room-heading">
          <div>
            <span className="cx-eyebrow"><StatusDot online={false} /> POKER · READ-ONLY PREVIEW</span>
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
            <div className="cx-game-stage pk-stage">
              <div className="pk-opponent-row">
                <span className="cx-eyebrow">OPPONENT{table.folded[oppSeat] ? ' · FOLDED' : table.allIn[oppSeat] ? ' · ALL-IN' : ''}</span>
                <div className="pk-hand">
                  {mode === 'waiting'
                    ? <p className="dm-waiting-copy">Waiting for an opponent to join table <code>{roundId?.slice(0, 12)}…</code></p>
                    : <><PlayingCard faceDown /><PlayingCard faceDown /></>}
                </div>
                {mode !== 'waiting' && <strong className="pk-stack">{cnpy(table.stacks[oppSeat])} CNPY</strong>}
              </div>

              <div className="pk-board">
                <span className="pk-street-label">{mode === 'settled' ? 'SHOWDOWN' : (table.street || 'PREFLOP').toUpperCase()}</span>
                <div className="pk-board-cards">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <PlayingCard key={index} card={table.board[index]} faceDown={!table.board[index]} />
                  ))}
                </div>
                <strong className="pk-pot">Pot · {cnpy(table.pot)} CNPY</strong>
                {mode === 'playing' && <p className="dm-turn-copy">{myTurn ? 'Your turn' : "Opponent's turn"}</p>}
              </div>

              <div className="pk-hand-row">
                <span className="cx-eyebrow">YOUR HAND</span>
                <div className="pk-hand">
                  {myHole.map((card, index) => <PlayingCard key={index} card={card} />)}
                </div>
                {mode !== 'waiting' && <strong className="pk-stack">{cnpy(table.stacks[mySeat])} CNPY</strong>}
                {myTurn && !table.finished && (
                  <div className="pk-actions">
                    <button className="pk-action-fold" onClick={() => submitAction('fold')}>Fold</button>
                    <button className="pk-action-call" onClick={() => submitAction('check_call')}>
                      {toCall > 0 ? `Call ${cnpy(toCall)}` : 'Check'}
                    </button>
                    <form className="pk-raise-form" onSubmit={handleRaiseSubmit}>
                      <input aria-label="Raise total in CNPY"
                        type="number" min="0" step="0.000001" placeholder={String(suggestedRaiseTo)}
                        value={raiseAmount} onChange={(event) => setRaiseAmount(event.target.value)}
                      />
                      <button type="submit" className="pk-action-raise">{toCall > 0 ? 'Raise to' : 'Bet'}</button>
                    </form>
                  </div>
                )}
              </div>
            </div>

            <div className="round-side pk-side">
              <TxStatus phase={phase} error={error} txHash={txHash} />
              {mode === 'settled' && result && (
                <div className={`result-card ${won ? 'is-win' : ''}`}>
                  <span className="cx-eyebrow">HAND RESULT</span>
                  <strong>{won ? 'You won' : 'No luck this hand'}</strong>
                  <p>{result.reason === 'fold' ? 'Opponent folded' : 'Showdown'} · {won ? `+${cnpy(myPayout)} CNPY net of rake.` : 'Better cards next hand.'}</p>
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
            <LiveRoom key={account?.address || 'guest'} account={account} onConnect={connect} walletBalance={balance} />
          ) : view === 'roulette' ? (
            <RouletteRoom key={account?.address || 'guest'} account={account} onConnect={connect} walletBalance={balance} />
          ) : view === 'domino' ? (
            <DominoRoom key={account?.address || 'guest'} account={account} onConnect={connect} />
          ) : view === 'poker' ? (
            <PokerRoom key={account?.address || 'guest'} account={account} onConnect={connect} />
          ) : (
            <>
              <Home onPlay={play} />
              <Games onPlay={play} />
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
