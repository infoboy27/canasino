import { useEffect, useMemo, useRef, useState } from 'react'
import {
  connectFleet,
  disconnectFleet,
  expireRoom,
  getFleetBalance,
  hasFleet,
  joinBingoRound,
  joinDominoTable,
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
import { IconBracket, IconBroadcast, IconChip, IconCoinLoop, IconGithub, IconHome, IconLaurel, IconShieldCheck, IconSparkle, IconStarBadge } from './lib/icons'
import './experience.css'

const games = [
  { id: 'bingo', name: 'Bingo', category: 'Social', glyph: 'B', live: true, players: 'Live rooms', description: 'Community rooms, verifiable draws and on-chain settlement.' },
  { id: 'poker', name: 'Poker', category: 'Table', glyph: '♠', live: false, players: 'Coming soon', description: 'Competitive tables with transparent pots and tournament play.' },
  { id: 'domino', name: 'Domino', category: 'Social', glyph: '••', live: true, players: 'Heads-up', description: 'Classic block dominoes, two players, settled on-chain from a replayed move log.' },
  { id: 'pool', name: 'Pool', category: 'Skill', glyph: '8', live: false, players: 'Coming soon', description: 'Head-to-head skill matches with escrowed stakes.' },
  { id: 'roulette', name: 'Roulette', category: 'Table', glyph: '0', live: true, players: 'Live wheel', description: 'European single-zero wheel, commit-reveal spin, settled on-chain.' },
  { id: 'crash', name: 'Crash', category: 'Originals', glyph: '↗', live: false, players: 'Coming soon', description: 'A fast Canasino Original built around transparent settlement.' },
]

const nav = [
  ['home', IconHome, 'Casino'],
  ['games', IconChip, 'Games'],
  ['rooms', IconBroadcast, 'Live rooms'],
  ['fairness', IconShieldCheck, 'Provably Fair'],
  ['rewards', IconLaurel, 'Rewards'],
]

const starterMessages = [
  { id: 'system-1', type: 'system', user: 'Canasino', text: 'Room chat opens when a live Bingo round is created.' },
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
  const value = Number(raw || 0) / 1_000_000
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '0'
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
          <span className={game.live ? 'live-label' : 'soon-label'}>{game.live ? <><StatusDot /> LIVE</> : 'COMING SOON'}</span>
        </div>
        <h3>{game.name}</h3>
        <p>{game.description}</p>
        <div className="cx-game-card-foot">
          <small>{game.players}</small>
          <button className={game.live ? 'cx-icon-button active' : 'cx-icon-button'} disabled={!game.live} onClick={() => game.live && onPlay(game)} aria-label={game.live ? `Play ${game.name}` : `${game.name} coming soon`}>→</button>
        </div>
      </div>
    </article>
  )
}

function WalletButton({ account, balance, onConnect, onDisconnect, connecting }) {
  if (account) {
    return (
      <div className="cx-wallet-connected">
        <button className="cx-balance-button" onClick={onDisconnect} title="Disconnect FleetWallet">
          <span className="wallet-orb" />
          <span><small>{balance?.whole ? `${balance.whole} ${balance.symbol || 'CNPY'}` : 'FleetWallet'}</small><strong>{shortAddress(account.address)}</strong></span>
          <b>⌄</b>
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
    <div className="cx-tx-state">
      <div className="tx-state-head"><span>ON-CHAIN ENTRY</span>{txHash && <small title={txHash}>{txHash.slice(0, 10)}…</small>}</div>
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
      {phase === 'confirmed' && <p className="success-copy">Entry verified. Your cards are loaded and the live draw can begin.</p>}
      {error && <p className="error-copy">{error}</p>}
    </div>
  )
}

function BingoCard({ card = [], balls = [] }) {
  if (!Array.isArray(card) || card.length === 0) {
    return (
      <div className="cx-card-placeholder">
        <div className="placeholder-grid">{Array.from({ length: 25 }).map((_, index) => <span key={index} />)}</div>
        <strong>Your verified card appears after entry</strong>
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
          return <span className={hit ? 'hit' : ''} key={`${number}-${index}`}>{free ? '★' : number}</span>
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
  const cellClass = (type, number) => `rw-cell ${type === 'straight' ? colorOf(number) : ''} ${isSelected(type, number) ? 'selected' : ''}`

  return (
    <div className={`rw-table ${disabled ? 'is-disabled' : ''}`}>
      <div className="rw-grid">
        <button type="button" className={cellClass('straight', 0)} onClick={() => onSelect('straight', 0)} disabled={disabled}>0</button>
        <div className="rw-grid-body">
          {TABLE_ROWS.map((row) => (
            <div className="rw-grid-row" key={row.bet}>
              {row.numbers.map((number) => (
                <button type="button" key={number} className={cellClass('straight', number)} onClick={() => onSelect('straight', number)} disabled={disabled}>
                  {number}
                </button>
              ))}
              <button type="button" className={`rw-cell rw-col-bet ${isSelected(row.bet) ? 'selected' : ''}`} onClick={() => onSelect(row.bet)} disabled={disabled}>2:1</button>
            </div>
          ))}
        </div>
      </div>
      <div className="rw-outside">
        <button type="button" className={`rw-cell ${isSelected('dozen1') ? 'selected' : ''}`} onClick={() => onSelect('dozen1')} disabled={disabled}>1st 12</button>
        <button type="button" className={`rw-cell ${isSelected('dozen2') ? 'selected' : ''}`} onClick={() => onSelect('dozen2')} disabled={disabled}>2nd 12</button>
        <button type="button" className={`rw-cell ${isSelected('dozen3') ? 'selected' : ''}`} onClick={() => onSelect('dozen3')} disabled={disabled}>3rd 12</button>
      </div>
      <div className="rw-outside rw-outside-even">
        <button type="button" className={`rw-cell ${isSelected('low') ? 'selected' : ''}`} onClick={() => onSelect('low')} disabled={disabled}>1–18</button>
        <button type="button" className={`rw-cell ${isSelected('even') ? 'selected' : ''}`} onClick={() => onSelect('even')} disabled={disabled}>Even</button>
        <button type="button" className={`rw-cell red ${isSelected('red') ? 'selected' : ''}`} onClick={() => onSelect('red')} disabled={disabled}>Red</button>
        <button type="button" className={`rw-cell black ${isSelected('black') ? 'selected' : ''}`} onClick={() => onSelect('black')} disabled={disabled}>Black</button>
        <button type="button" className={`rw-cell ${isSelected('odd') ? 'selected' : ''}`} onClick={() => onSelect('odd')} disabled={disabled}>Odd</button>
        <button type="button" className={`rw-cell ${isSelected('high') ? 'selected' : ''}`} onClick={() => onSelect('high')} disabled={disabled}>19–36</button>
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

function DominoTile({ tile, faceDown = false, orientation = 'horizontal', selected = false, disabled = false, onClick }) {
  if (faceDown) return <div className={`dm-tile face-down ${orientation}`} />
  const [low, high] = tile
  return (
    <button
      type="button"
      className={`dm-tile ${orientation} ${selected ? 'selected' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <DominoPips value={low} /><i /><DominoPips value={high} />
    </button>
  )
}

function ChatPanel({ messages, value, onChange, onSend, connected, account, mobileClose }) {
  return (
    <aside className="cx-chat-panel">
      <div className="chat-head">
        <div><StatusDot online={connected} /><span><strong>Room chat</strong><small>{connected ? 'Live channel' : 'Waiting for room'}</small></span></div>
        {mobileClose && <button onClick={mobileClose}>×</button>}
      </div>
      <div className="chat-messages">
        {messages.map((message) => (
          <div className={`chat-message ${message.type === 'system' ? 'system' : ''}`} key={message.id}>
            <div><strong>{message.user}</strong><small>{message.time || ''}</small></div>
            <p>{message.text}</p>
          </div>
        ))}
      </div>
      <form className="chat-compose" onSubmit={onSend}>
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={account ? 'Message the room…' : 'Connect wallet to chat'} disabled={!connected || !account} maxLength={240} />
        <button disabled={!connected || !account || !value.trim()} aria-label="Send message">↑</button>
      </form>
    </aside>
  )
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
        setError(`Live room service unavailable: ${err.message}`)
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
          setMessages((current) => [...current, {
            id: `${Date.now()}-${Math.random()}`,
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
  const canOfferRefund = round?.roundId && phase !== 'confirmed' && roundCreatedAt
    && (now - roundCreatedAt) >= EXPIRE_HINT_MS

  useEffect(() => {
    if (!round?.roundId || phase === 'confirmed') return undefined
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [round?.roundId, phase])

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
        text: 'Refund submitted — escrowed entries for this room are being returned on-chain.',
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
        entryFee: Number(info.entryFee ?? info.entry_fee ?? selectedRoom.entryFee),
        rakeBps: Number(info.rakeBps ?? info.rake_bps ?? selectedRoom.rakeBps),
        chainId: Number(info.chainId ?? info.chain_id),
        networkId: Number(info.networkId ?? info.network_id),
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

      await registerRound(round.roundId, account.address, numCards)
      const cardResponse = await getCard(round.roundId, account.address, numCards)
      setCards(cardResponse.cards || [])
      setPhase('confirmed')
      getRoundProof(round.roundId).then(setProof).catch(() => null)
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
            <span className="cx-eyebrow"><StatusDot online={roomsState === 'ready'} /> BINGO · LIVE ON CANOPY</span>
            <h1>Enter the <em>gold room.</em></h1>
            <p>Create a real round, sign the entry in FleetWallet, watch the draw and talk to the table without leaving the game.</p>
          </div>
        </div>

        <div className="cx-room-layout">
          <div className="cx-game-stage">
            <div className="stage-topbar">
              <div><span className="table-badge"><StatusDot /> LIVE TABLE</span><strong>{selectedRoom?.name || 'Bingo room'}</strong></div>
              <button className="mobile-chat-toggle" onClick={() => setChatOpen(true)}>Chat <span>{messages.filter((m) => m.type !== 'system').length}</span></button>
            </div>

            <div className="ball-stage">
              <div className={`draw-machine ${latestBall ? 'has-ball' : ''}`}>
                <span className="machine-ring ring-1" />
                <span className="machine-ring ring-2" />
                <div className="draw-ball">
                  {latestBall ? <><small>{latestBall.letter || ''}</small><strong>{latestBall.number}</strong></> : <><small>ROUND</small><strong>{round ? 'LIVE' : '—'}</strong></>}
                </div>
              </div>
              <div className="draw-copy">
                <span className="cx-eyebrow">CURRENT DRAW</span>
                <h2>{latestBall ? `${latestBall.letter || ''}${latestBall.number}` : round ? 'Waiting for draw' : 'Create a room'}</h2>
                <p>{round ? `${balls.length} balls received from the live round socket.` : 'Select a room below to open a verifiable round.'}</p>
              </div>
              <div className="recent-balls">
                {balls.slice(-8).reverse().map((ball, index) => <span className={index === 0 ? 'latest' : ''} key={`${ball.index ?? index}-${ball.number}`}>{ball.letter}{ball.number}</span>)}
                {balls.length === 0 && Array.from({ length: 5 }).map((_, index) => <span className="ghost" key={index}>•</span>)}
              </div>
            </div>

            <div className="player-surface">
              <div className="card-area">
                <div className="surface-title"><span><small>YOUR CARD</small><strong>{account ? shortAddress(account.address) : 'Wallet not connected'}</strong></span>{cards.length > 1 && <b>{cards.length} cards</b>}</div>
                <BingoCard card={cards[0]} balls={balls} />
              </div>
              <div className="round-side">
                <TxStatus phase={phase} error={error} txHash={txHash} />
                {result && (
                  <div className={`result-card ${result.winners?.includes(account?.address) ? 'is-win' : ''}`}>
                    <span className="cx-eyebrow">ROUND RESULT</span>
                    <strong>{result.winners?.includes(account?.address) ? 'You won' : 'Round settled'}</strong>
                    <p>{Array.isArray(result.winners) && result.winners.length ? `${result.winners.length} winner${result.winners.length > 1 ? 's' : ''} verified.` : 'Settlement received from the live round.'}</p>
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
              {roomsState === 'loading' && <span className="room-loading">Loading live room templates…</span>}
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
              <button onClick={() => setNumCards((value) => Math.max(1, value - 1))}>−</button>
              <span><strong>{numCards}</strong><small>{numCards === 1 ? 'card' : 'cards'}</small></span>
              <button onClick={() => setNumCards((value) => Math.min(4, value + 1))}>+</button>
            </div>
            <small className="cost-note">Entry · {cnpy(amount)} CNPY</small>
          </div>

          <div className="control-section action-control">
            <span className="control-label">03 · ENTER ON-CHAIN</span>
            {!round ? (
              <button className="cx-gold-button" onClick={handleCreateRoom} disabled={!selectedRoom || roomsState !== 'ready'}><span>Create live room</span><b>→</b></button>
            ) : phase === 'confirmed' ? (
              <button className="cx-confirmed-button" disabled><span>Entry verified</span><b>✓</b></button>
            ) : (
              <button className="cx-gold-button" onClick={handleJoin} disabled={phase === 'awaiting-signature' || phase === 'submitted'}><span>{account ? 'Sign & join room' : 'Connect FleetWallet'}</span><b>→</b></button>
            )}
            <small>{walletBalance?.whole ? `Available · ${walletBalance.whole} ${walletBalance.symbol || 'CNPY'}` : 'Self-custody · approval required'}</small>
          </div>
        </div>

        <div className="cx-proof-strip">
          <div><span className="proof-icon">✓</span><span><small>PROVABLY FAIR</small><strong>{proof?.commitment ? `${String(proof.commitment).slice(0, 18)}…` : 'Proof appears with the round'}</strong></span></div>
          <div><small>ROUND</small><strong>{round?.roundId ? `${round.roundId.slice(0, 12)}…` : '—'}</strong></div>
          <div><small>CHAIN</small><strong>{roundInfo?.chainId || 'Dynamic'}</strong></div>
          <div><small>RAKE</small><strong>{selectedRoom?.rakeBps ? `${selectedRoom.rakeBps / 100}%` : '—'}</strong></div>
          <button onClick={() => round?.roundId && getRoundProof(round.roundId).then(setProof).catch(() => null)} disabled={!round}>Refresh proof</button>
        </div>
      </div>

      {chatOpen && <div className="mobile-chat-sheet"><div className="mobile-chat-backdrop" onClick={() => setChatOpen(false)} /><ChatPanel messages={messages} value={chatText} onChange={setChatText} onSend={sendChat} connected={chatConnected} account={account} mobileClose={() => setChatOpen(false)} /></div>}
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
  const [roundMeta, setRoundMeta] = useState(null)
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
        rakeBps: Number(info.rakeBps ?? created.rakeBps ?? 0),
        minBet: Number(info.minBet ?? created.minBet ?? 0),
        maxBet: Number(info.maxBet ?? created.maxBet ?? 0),
        chainId: Number(info.chainId),
        networkId: Number(info.networkId),
        rpcUrl: info.rpcUrl,
      })
      setBetAmount(String(Math.max(1, Math.round((info.minBet ?? created.minBet ?? 1_000_000) / 1_000_000))))
      setPhase('round-ready')
      setRoundId(id)
    } catch (err) {
      setOpenError(`Could not open a new wheel: ${err.message}`)
    }
  }

  useEffect(() => {
    startNewRound()
    return () => window.clearTimeout(respinTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId])

  const betsOpen = phase !== 'idle' && spinPhase === 'waiting' && (secondsLeft == null || secondsLeft > 0)
  const minBetWhole = roundInfo?.minBet ? roundInfo.minBet / 1_000_000 : 0
  const maxBetWhole = roundInfo?.maxBet ? roundInfo.maxBet / 1_000_000 : 0

  async function handlePlaceBet() {
    setError('')
    if (!account) { onConnect(); return }
    if (!selectedBet) { setError('Choose a bet on the table first.'); return }
    if (!roundId || !roundInfo?.rpcUrl) { setError('Waiting for the wheel to open.'); return }
    const amount = Math.round(Number(betAmount) * 1_000_000)
    if (!Number.isFinite(amount) || amount < roundInfo.minBet || amount > roundInfo.maxBet) {
      setError(`Bet must be between ${minBetWhole} and ${maxBetWhole} CNPY.`)
      return
    }

    try {
      setPhase('awaiting-signature')
      const signed = await placeRouletteBet({
        roundId, betType: selectedBet.type, betNumber: selectedBet.number || 0, amount,
        rpcUrl: roundInfo.rpcUrl, chainId: roundInfo.chainId, networkId: roundInfo.networkId,
      })
      setTxHash(signed?.txHash || '')
      setPhase('submitted')
      await registerRouletteBet(roundId, account.address, selectedBet.type, selectedBet.number || 0, amount)
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
            <span className="cx-eyebrow"><StatusDot online={spinPhase !== 'waiting' || Boolean(roundId)} /> ROULETTE · LIVE ON CANOPY</span>
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
                  {spinPhase === 'spinning' ? 'SPINNING' : spinPhase === 'settled' ? 'RESULT' : 'BETS OPEN'}
                </span>
                <h2>
                  {spinPhase === 'settled' && spinResult
                    ? `${spinResult.spin} ${spinResult.color}`
                    : spinPhase === 'spinning'
                    ? 'No more bets'
                    : secondsLeft != null ? `${secondsLeft}s to place a bet` : 'Opening the table…'}
                </h2>
                <p>
                  {spinPhase === 'settled'
                    ? `Table respins in a few seconds — proof is on the right.`
                    : myBet
                    ? `Your bet: ${betLabel(myBet)} · ${(myBet.amount / 1_000_000).toLocaleString()} CNPY`
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
                <small>{roundInfo ? `${minBetWhole} – ${maxBetWhole} CNPY per bet` : 'Loading table limits…'}</small>
              </div>
              <div className="control-section rw-amount">
                <span className="control-label">02 · AMOUNT (CNPY)</span>
                <input
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
                  <button className="cx-gold-button" onClick={handlePlaceBet} disabled={!betsOpen || phase === 'awaiting-signature' || phase === 'submitted'}>
                    <span>{account ? 'Sign & place bet' : 'Connect FleetWallet'}</span><b>→</b>
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
                    ? `+${(myPayout / 1_000_000).toLocaleString()} CNPY net of rake.`
                    : `Your ${betLabel(myBet)} bet did not match.`}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="cx-proof-strip">
          <div><span className="proof-icon">✓</span><span><small>PROVABLY FAIR</small><strong>{proof?.commitment ? `${String(proof.commitment).slice(0, 18)}…` : 'Proof appears with the round'}</strong></span></div>
          <div><small>ROUND</small><strong>{roundId ? `${roundId.slice(0, 12)}…` : '—'}</strong></div>
          <div><small>CHAIN</small><strong>{roundInfo?.chainId || 'Dynamic'}</strong></div>
          <div><small>RAKE</small><strong>{roundInfo?.rakeBps ? `${roundInfo.rakeBps / 100}%` : '—'}</strong></div>
          <button onClick={() => roundId && getRouletteProof(roundId).then(setProof).catch(() => null)} disabled={!roundId}>Refresh proof</button>
        </div>
        {proof?.seed && <p className="rw-seed-reveal">Seed revealed: <code>{proof.seed}</code> — anyone can recompute <code>sha256(seed)</code> and check it against the commitment above.</p>}
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
  const [players, setPlayers] = useState([])
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
      setPhase('awaiting-signature')
      const signed = await joinDominoTable({
        roundId: rid, amount: info.entryFee, rpcUrl: info.rpcUrl, chainId: info.chainId, networkId: info.networkId,
      })
      setTxHash(signed?.txHash || '')
      setPhase('submitted')
      await registerDominoJoin(rid, account.address)
      const hand = await getDominoHand(rid, account.address)
      setMyHand(hand.hand)
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
        entryFee: Number(info.entryFee), rakeBps: Number(info.rakeBps),
        chainId: Number(info.chainId), networkId: Number(info.networkId), rpcUrl: info.rpcUrl,
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
        entryFee: Number(info.entryFee), rakeBps: Number(info.rakeBps),
        chainId: Number(info.chainId), networkId: Number(info.networkId), rpcUrl: info.rpcUrl,
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
            <span className="cx-eyebrow"><StatusDot online={mode !== 'lobby'} /> DOMINO · LIVE ON CANOPY</span>
            <h1>Heads-up at the <em>table.</em></h1>
            <p>Classic block dominoes, two players. The operator commits to a hidden seed before the table opens; the plugin only ever trusts a move log it can replay and verify itself.</p>
          </div>
        </div>

        {mode === 'lobby' && (
          <div className="dm-lobby">
            <div className="control-section">
              <span className="control-label">CREATE A TABLE</span>
              <p>Open a new heads-up table and share its ID with an opponent.</p>
              <button className="cx-gold-button" onClick={handleCreateTable}><span>{account ? 'Create table' : 'Connect FleetWallet'}</span><b>→</b></button>
            </div>
            <div className="control-section">
              <span className="control-label">JOIN A TABLE</span>
              <p>Paste the table ID your opponent shared with you.</p>
              <div className="dm-join-row">
                <input value={joinInput} onChange={(event) => setJoinInput(event.target.value)} placeholder="Table ID" />
                <button className="cx-gold-button" onClick={handleJoinTable} disabled={!joinInput.trim()}><span>{account ? 'Join table' : 'Connect FleetWallet'}</span><b>→</b></button>
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
                  <p>{result.reason === 'blocked' ? 'Table blocked' : 'Hand emptied'} · {won ? `+${(myPayout / 1_000_000).toLocaleString()} CNPY net of rake.` : 'Better luck at the next table.'}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {roundId && (
          <div className="cx-proof-strip">
            <div><span className="proof-icon">✓</span><span><small>PROVABLY FAIR</small><strong>Table {roundId.slice(0, 12)}…</strong></span></div>
            <div><small>ENTRY</small><strong>{roundInfo ? `${(roundInfo.entryFee / 1_000_000).toLocaleString()} CNPY` : '—'}</strong></div>
            <div><small>CHAIN</small><strong>{roundInfo?.chainId || 'Dynamic'}</strong></div>
            <div><small>RAKE</small><strong>{roundInfo?.rakeBps ? `${roundInfo.rakeBps / 100}%` : '—'}</strong></div>
            <button onClick={() => getDominoProof(roundId).then(setProof).catch(() => null)}>Refresh proof</button>
          </div>
        )}
        {proof?.seed && <p className="rw-seed-reveal">Seed revealed: <code>{proof.seed}</code> — anyone can replay the {proof.moves?.length || 0}-move log against it and confirm the winner themselves.</p>}
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
          <span className="cx-eyebrow"><StatusDot /> A CANOPY ECOSYSTEM CASINO</span>
          <h1>Play with the house.<br /><em>Verify the house.</em></h1>
          <p>Canasino turns casino games into transparent on-chain experiences: self-custody entry, verifiable rounds, multiplayer rooms and settlement players can inspect.</p>
          <div className="hero-buttons"><button className="cx-gold-button hero-button" onClick={() => onPlay(games[0])}><span>Enter Bingo Live</span><b>→</b></button><a className="cx-text-button" href="#fairness">See how fairness works <b>↗</b></a></div>
          <div className="hero-proof-row"><span><i>✓</i> Self-custody</span><span><i>✓</i> On-chain entry</span><span><i>✓</i> Live room chat</span><span><i>✓</i> Verifiable settlement</span></div>
        </div>
        <div className="cx-hero-art" aria-hidden="true">
          <div className="hero-floor" />
          <div className="hero-chip chip-back"><span>CASN</span></div>
          <div className="hero-chip chip-main"><small>CANASINO</small><strong>C</strong><span>PLAY · WIN · ON-CHAIN</span></div>
          <div className="hero-card-float float-one"><b>A</b><strong>♠</strong></div>
          <div className="hero-card-float float-two"><b>K</b><strong>♦</strong></div>
          <div className="hero-verify"><i>✓</i><span><small>ROUND PROOF</small><strong>VERIFIABLE</strong></span></div>
        </div>
      </section>

      <section className="cx-metrics">
        <div><small>LIVE GAME</small><strong>Bingo</strong><span><StatusDot /> Available now</span></div>
        <div><small>SETTLEMENT</small><strong>On-chain</strong><span>Canopy native</span></div>
        <div><small>WALLET</small><strong>FleetWallet</strong><span>Self-custody signing</span></div>
        <div><small>SOCIAL</small><strong>Room chat</strong><span>WebSocket live</span></div>
      </section>
    </>
  )
}

function Games({ onPlay }) {
  const [filter, setFilter] = useState('All')
  const categories = ['All', 'Live', 'Social', 'Table', 'Originals']
  const filtered = games.filter((game) => filter === 'All' || (filter === 'Live' ? game.live : game.category === filter))

  return (
    <section className="cx-games" id="games">
      <div className="cx-section-heading">
        <div><span className="cx-eyebrow">THE CANASINO FLOOR</span><h2>Games designed to feel <em>alive.</em></h2></div>
        <p>Bingo is connected to the existing live game-server path. Future games are intentionally labeled rather than presented as fake functionality.</p>
      </div>
      <div className="cx-filter-row">{categories.map((item) => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div>
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
        <p>Canasino exposes the cryptographic lifecycle next to the round itself. Players shouldn't need to search documentation to understand whether a result can be reproduced.</p>
        <div className="fairness-steps">
          <div><b>01</b><span><strong>Commit</strong><small>Round commitment is published before the result.</small></span></div>
          <div><b>02</b><span><strong>Play</strong><small>The player joins from a self-custody wallet.</small></span></div>
          <div><b>03</b><span><strong>Reveal</strong><small>Round data becomes inspectable after play.</small></span></div>
          <div><b>04</b><span><strong>Settle</strong><small>Winner and payout state are linked to chain settlement.</small></span></div>
        </div>
      </div>
      <div className="proof-demo">
        <div className="proof-demo-head"><span><i>✓</i><span><small>CANASINO</small><strong>Round verifier</strong></span></span><b>LIVE-READY UI</b></div>
        <label><span>Commitment</span><div>7f2c8d10…b931 <button>Copy</button></div></label>
        <div className="proof-demo-grid"><label><span>Chain</span><div>Canopy</div></label><label><span>Status</span><div className="verified-text">✓ Verified</div></label></div>
        <div className="proof-code"><span>commitment</span><strong>matches(reveal, round)</strong><i>TRUE</i></div>
        <p>The live Bingo room replaces these demonstration values with `/rounds/:id/proof` data.</p>
      </div>
    </section>
  )
}

function Rewards() {
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

  useEffect(() => {
    let alive = true
    ;(async () => {
      await waitForFleet()
      const restored = await restoreFleet()
      if (!alive || !restored) return
      setAccount(restored)
      setBalance(await getFleetBalance())
    })()
    return () => { alive = false }
  }, [])

  async function connect() {
    setWalletNotice('')
    if (!hasFleet()) {
      setWalletNotice('FleetWallet is not detected in this browser. Install or enable the extension to use self-custody play.')
      return
    }

    setWalletState('connecting')
    try {
      const next = await connectFleet()
      setAccount(next)
      setBalance(await getFleetBalance())
    } catch (error) {
      setWalletNotice(error?.message || 'Wallet connection failed.')
    } finally {
      setWalletState('idle')
    }
  }

  async function disconnect() {
    await disconnectFleet()
    setAccount(null)
    setBalance(null)
  }

  function play(game) {
    if (!['bingo', 'roulette', 'domino'].includes(game.id)) return
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
      <aside className="cx-sidebar">
        <button className="cx-logo-button" onClick={() => navigate('home')}><Logo compact /></button>
        <nav>{nav.map(([id, Icon, label]) => <button className={active === id ? 'active' : ''} key={id} onClick={() => navigate(id)} title={label}><span><Icon /></span><small>{label}</small></button>)}</nav>
        <div className="sidebar-bottom"><a href="https://github.com/infoboy27/canasino" target="_blank" rel="noreferrer" title="GitHub"><IconGithub /></a><button title="Responsible play">18+</button></div>
      </aside>

      <div className="cx-page">
        <header className="cx-header">
          <button className="mobile-brand" onClick={() => navigate('home')}><Logo /></button>
          <div className="desktop-header-brand"><Logo /></div>
          <div className="cx-header-center"><button className={view === 'casino' ? 'active' : ''} onClick={() => navigate('home')}>Casino</button><button className={view === 'bingo' ? 'active' : ''} onClick={() => play(games[0])}>Bingo Live <StatusDot /></button><button className={view === 'roulette' ? 'active' : ''} onClick={() => play(games.find((game) => game.id === 'roulette'))}>Roulette Live <StatusDot /></button><button className={view === 'domino' ? 'active' : ''} onClick={() => play(games.find((game) => game.id === 'domino'))}>Domino Live <StatusDot /></button><button onClick={() => navigate('fairness')}>Fairness</button></div>
          <WalletButton account={account} balance={balance} onConnect={connect} onDisconnect={disconnect} connecting={walletState === 'connecting'} />
        </header>

        {walletNotice && <div className="cx-wallet-notice"><span>!</span><p>{walletNotice}</p><button onClick={() => setWalletNotice('')}>×</button></div>}

        <main>
          {view === 'bingo' ? (
            <LiveRoom account={account} onConnect={connect} walletBalance={balance} />
          ) : view === 'roulette' ? (
            <RouletteRoom account={account} onConnect={connect} walletBalance={balance} />
          ) : view === 'domino' ? (
            <DominoRoom account={account} onConnect={connect} />
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
          <p>Canasino is a Canopy ecosystem gaming interface. Play responsibly. 18+ where applicable.</p>
          <div><a href="#fairness">Provably Fair</a><a href="https://github.com/infoboy27/canasino" target="_blank" rel="noreferrer">GitHub</a></div>
        </footer>

        <nav className="cx-mobile-nav">{nav.slice(0, 4).map(([id, Icon, label]) => <button className={active === id ? 'active' : ''} key={id} onClick={() => navigate(id)}><span><Icon /></span><small>{label}</small></button>)}</nav>
      </div>
    </div>
  )
}
