import { useEffect, useMemo, useRef, useState } from 'react'
import {
  connectFleet,
  disconnectFleet,
  expireRoom,
  getFleetBalance,
  hasFleet,
  joinBingoRound,
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
import { IconBracket, IconBroadcast, IconChip, IconCoinLoop, IconGithub, IconHome, IconLaurel, IconShieldCheck, IconSparkle, IconStarBadge } from './lib/icons'
import './experience.css'

const games = [
  { id: 'bingo', name: 'Bingo', category: 'Social', glyph: 'B', live: true, players: 'Live rooms', description: 'Community rooms, verifiable draws and on-chain settlement.' },
  { id: 'poker', name: 'Poker', category: 'Table', glyph: '♠', live: false, players: 'Coming soon', description: 'Competitive tables with transparent pots and tournament play.' },
  { id: 'domino', name: 'Domino', category: 'Social', glyph: '••', live: false, players: 'Coming soon', description: 'Caribbean table culture rebuilt for on-chain multiplayer.' },
  { id: 'pool', name: 'Pool', category: 'Skill', glyph: '8', live: false, players: 'Coming soon', description: 'Head-to-head skill matches with escrowed stakes.' },
  { id: 'roulette', name: 'Roulette', category: 'Table', glyph: '0', live: false, players: 'Coming soon', description: 'Classic roulette with auditable round inputs.' },
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
    if (game.id !== 'bingo') return
    setView('bingo')
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
          <div className="cx-header-center"><button className={view === 'casino' ? 'active' : ''} onClick={() => navigate('home')}>Casino</button><button className={view === 'bingo' ? 'active' : ''} onClick={() => play(games[0])}>Bingo Live <StatusDot /></button><button onClick={() => navigate('fairness')}>Fairness</button></div>
          <WalletButton account={account} balance={balance} onConnect={connect} onDisconnect={disconnect} connecting={walletState === 'connecting'} />
        </header>

        {walletNotice && <div className="cx-wallet-notice"><span>!</span><p>{walletNotice}</p><button onClick={() => setWalletNotice('')}>×</button></div>}

        <main>
          {view === 'bingo' ? (
            <LiveRoom account={account} onConnect={connect} walletBalance={balance} />
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
