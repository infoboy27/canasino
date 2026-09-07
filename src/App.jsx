import { useMemo, useState } from 'react'

const chainStats = [
  { label: 'Genesis supply', value: '100M', unit: 'CASN' },
  { label: 'Block time', value: '6', unit: 'SEC' },
  { label: 'Block reward', value: '1', unit: 'CASN' },
  { label: 'Halving cycle', value: '730', unit: 'DAYS' },
]

const categories = ['All', 'Originals', 'Table', 'Social', 'Instant']

const games = [
  { name: 'Crash', category: 'Originals', symbol: '↗', accent: 'green', description: 'Cash out before the curve breaks.', tag: 'CANASINO ORIGINAL' },
  { name: 'Mines', category: 'Originals', symbol: '✦', accent: 'gold', description: 'Reveal the board. Push your luck.', tag: 'CANASINO ORIGINAL' },
  { name: 'Plinko', category: 'Originals', symbol: '•••', accent: 'lime', description: 'Drop, bounce and verify every result.', tag: 'CANASINO ORIGINAL' },
  { name: 'Dice', category: 'Originals', symbol: '⚄', accent: 'amber', description: 'Simple odds. Transparent settlement.', tag: 'CANASINO ORIGINAL' },
  { name: 'Roulette', category: 'Table', symbol: '●', accent: 'red', description: 'Classic wheel mechanics rebuilt on-chain.', tag: 'TABLE' },
  { name: 'Blackjack', category: 'Table', symbol: '♠', accent: 'blue', description: 'Fast hands with verifiable state.', tag: 'TABLE' },
  { name: 'Poker', category: 'Table', symbol: '♦', accent: 'violet', description: 'Competitive tables and transparent pots.', tag: 'TOURNAMENT' },
  { name: 'Bingo', category: 'Social', symbol: '◆', accent: 'pink', description: 'Community rooms and verifiable draws.', tag: 'SOCIAL' },
  { name: 'Limbo', category: 'Instant', symbol: '∞', accent: 'cyan', description: 'Pick a multiplier and test the edge.', tag: 'INSTANT' },
  { name: 'Coin Flip', category: 'Instant', symbol: 'C', accent: 'bronze', description: 'Heads or tails with auditable outcomes.', tag: 'INSTANT' },
]

const navItems = [
  { icon: '⌂', label: 'Casino', href: '#casino' },
  { icon: '◆', label: 'Originals', href: '#games' },
  { icon: '♠', label: 'Table games', href: '#games' },
  { icon: '◉', label: 'Live', href: '#activity' },
  { icon: '♛', label: 'VIP Club', href: '#vip' },
  { icon: '✓', label: 'Provably Fair', href: '#fairness' },
]

const rewards = [
  { icon: '↺', title: 'Rakeback', text: 'Reward active play with transparent, claimable value.' },
  { icon: '✦', title: 'Daily Drops', text: 'Build recurring reward moments around CASN activity.' },
  { icon: '♛', title: 'VIP Progress', text: 'A visible progression path with increasingly premium perks.' },
  { icon: '⚑', title: 'Tournaments', text: 'On-chain prize pools for community competition.' },
]

function Brand({ compact = false }) {
  return (
    <a className="brand" href="#casino" aria-label="Canasino home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="29" className="logo-ring" />
          <path d="M40.6 20.6c-2.4-2.1-5.3-3.2-8.6-3.2-8.1 0-14.4 6.4-14.4 14.6 0 8.3 6.3 14.6 14.4 14.6 3.6 0 6.8-1.2 9.2-3.6l-4.4-5.2a7 7 0 0 1-4.6 1.7c-4.1 0-7-3.2-7-7.5s2.9-7.5 7-7.5c1.8 0 3.3.6 4.6 1.7l3.8-5.6Z" className="logo-c" />
          <path d="M37.5 31.8 48.7 22l-2.3 12.4 7.1 3.9-11.2 1.2-4.8-7.7Z" className="logo-leaf" />
        </svg>
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>CANASINO</strong>
          <small>PLAY · WIN · ON-CHAIN</small>
        </span>
      )}
    </a>
  )
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
}

function Arrow() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 6l4 4-4 4" /></svg>
}

function WalletModal({ onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="wallet-modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="wallet-icon">C</div>
        <span className="kicker">WALLET CONNECTION</span>
        <h3 id="wallet-title">Connect to Canasino</h3>
        <p>The interface is ready for wallet integration. The production connector will be enabled once the Canasino chain endpoint and supported wallet flow are finalized.</p>
        <div className="wallet-options">
          <button disabled><span>◈</span> EVM Wallet <small>Coming next</small></button>
          <button disabled><span>◉</span> Canopy Wallet <small>Coming next</small></button>
        </div>
        <button className="secondary-button full" onClick={onClose}>Back to casino</button>
      </div>
    </div>
  )
}

function GameCard({ game }) {
  return (
    <article className={`lobby-card accent-${game.accent}`}>
      <div className="lobby-art">
        <div className="art-orbit orbit-a" />
        <div className="art-orbit orbit-b" />
        <span className="game-symbol">{game.symbol}</span>
        <span className="game-tag">{game.tag}</span>
        <span className="soon-pill">COMING SOON</span>
      </div>
      <div className="lobby-card-copy">
        <div>
          <h3>{game.name}</h3>
          <p>{game.description}</p>
        </div>
        <span className="card-arrow"><Arrow /></span>
      </div>
    </article>
  )
}

function App() {
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [walletOpen, setWalletOpen] = useState(false)
  const [feedTab, setFeedTab] = useState('Recent bets')

  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      const categoryMatch = category === 'All' || game.category === category
      const searchMatch = game.name.toLowerCase().includes(query.toLowerCase())
      return categoryMatch && searchMatch
    })
  }, [category, query])

  return (
    <div className="casino-shell" id="casino">
      <div className="noise" />

      <aside className="side-rail">
        <div className="rail-brand"><Brand compact /></div>
        <nav className="rail-nav" aria-label="Casino navigation">
          {navItems.map((item, index) => (
            <a href={item.href} key={item.label} className={index === 0 ? 'active' : ''}>
              <span className="rail-icon">{item.icon}</span>
              <span className="rail-label">{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="rail-bottom">
          <a href="https://github.com/infoboy27/canasino" target="_blank" rel="noreferrer"><span className="rail-icon">⌘</span><span className="rail-label">GitHub</span></a>
          <a href="#footer"><span className="rail-icon">?</span><span className="rail-label">Support</span></a>
        </div>
      </aside>

      <div className="app-column">
        <header className="topbar">
          <div className="topbar-inner">
            <Brand />
            <div className="top-search">
              <SearchIcon />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search games" aria-label="Search games" />
              <kbd>/</kbd>
            </div>
            <div className="top-actions">
              <a className="chain-pill" href="#network"><span /> CANOPY · CASN</a>
              <button className="wallet-button" onClick={() => setWalletOpen(true)}>Connect wallet</button>
            </div>
          </div>
        </header>

        <main className="casino-main">
          <section className="hero-zone content-width">
            <div className="hero-card hero-primary">
              <div className="hero-copy">
                <span className="kicker">THE CASINO YOU CAN VERIFY</span>
                <h1>The house is<br /><em>on-chain.</em></h1>
                <p>Fast casino UX with transparent outcomes, on-chain settlement and a native economy powered by CASN.</p>
                <div className="hero-actions">
                  <a className="primary-button" href="#games">Explore originals <Arrow /></a>
                  <a className="secondary-button" href="#fairness">How fairness works</a>
                </div>
                <div className="hero-trust">
                  <span>✓ Provably fair design</span>
                  <span>✓ Transparent settlement</span>
                  <span>✓ Player-first rewards</span>
                </div>
              </div>
              <div className="hero-stage" aria-hidden="true">
                <div className="hero-gridlines" />
                <div className="gold-ring ring-one" />
                <div className="gold-ring ring-two" />
                <div className="big-chip">
                  <div className="chip-face">
                    <small>CANASINO</small>
                    <strong>C</strong>
                    <span>CASN</span>
                  </div>
                </div>
                <div className="playing-card playing-card-a"><small>A</small><strong>♠</strong></div>
                <div className="playing-card playing-card-k"><small>K</small><strong>♦</strong></div>
                <div className="floating-proof"><span>✓</span><div><small>VERIFIABLE</small><strong>OUTCOMES</strong></div></div>
              </div>
            </div>

            <div className="promo-stack">
              <a className="mini-promo promo-fair" href="#fairness">
                <span className="kicker">PROVABLY FAIR</span>
                <strong>Verify every<br />original round.</strong>
                <span className="mini-cta">Open verifier <Arrow /></span>
                <span className="promo-icon">✓</span>
              </a>
              <a className="mini-promo promo-casn" href="#vip">
                <span className="kicker">CASN CLUB</span>
                <strong>Rewards that live<br />with the player.</strong>
                <span className="mini-cta">Explore rewards <Arrow /></span>
                <span className="promo-icon">♛</span>
              </a>
            </div>
          </section>

          <section className="lobby-section content-width" id="games">
            <div className="section-bar">
              <div>
                <span className="section-kicker">CANASINO ORIGINALS</span>
                <h2>Built for crypto-native play</h2>
              </div>
              <a href="#fairness">Provably fair <Arrow /></a>
            </div>

            <div className="game-toolbar">
              <div className="category-tabs">
                {categories.map((item) => (
                  <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>
                ))}
              </div>
              <label className="mobile-search">
                <SearchIcon />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
              </label>
            </div>

            <div className="lobby-grid">
              {filteredGames.map((game) => <GameCard game={game} key={game.name} />)}
            </div>
            {filteredGames.length === 0 && <div className="empty-state">No games match your search.</div>}
          </section>

          <section className="activity-section content-width" id="activity">
            <div className="section-bar compact">
              <div>
                <span className="section-kicker">CASINO FLOOR</span>
                <h2>Activity, without the black box</h2>
              </div>
              <span className="launch-note">ACTIVATES WITH GAMEPLAY</span>
            </div>
            <div className="activity-panel">
              <div className="activity-tabs">
                {['Recent bets', 'High rollers', 'Lucky wins'].map((item) => (
                  <button key={item} onClick={() => setFeedTab(item)} className={feedTab === item ? 'active' : ''}>{item}</button>
                ))}
              </div>
              <div className="activity-head"><span>Game</span><span>Player</span><span>Bet</span><span>Multiplier</span><span>Payout</span><span>Proof</span></div>
              <div className="activity-empty">
                <div className="activity-pulse"><span /><span /><span /></div>
                <strong>{feedTab} will appear here</strong>
                <p>Once Canasino Originals are live, this feed can surface settlement and verification links directly from each round.</p>
              </div>
            </div>
          </section>

          <section className="fairness-section content-width" id="fairness">
            <div className="fair-copy">
              <span className="section-kicker">PROVABLY FAIR, MADE VISIBLE</span>
              <h2>Don't trust the house.<br /><em>Verify the round.</em></h2>
              <p>Most casinos bury fairness behind documentation. Canasino brings verification into the product experience so a player can inspect the cryptographic inputs behind an Original game round.</p>
              <div className="fair-points">
                <span><b>01</b> Commit before the round</span>
                <span><b>02</b> Player-influenced input</span>
                <span><b>03</b> Reproduce the outcome</span>
                <span><b>04</b> Link settlement on-chain</span>
              </div>
            </div>
            <div className="verifier-card">
              <div className="verifier-title"><div><span className="verify-mark">✓</span><div><small>CANASINO TOOL</small><strong>Round Verifier</strong></div></div><span className="status-draft">UI READY</span></div>
              <label><span>Server seed hash</span><div className="fake-input">7f2c…9b31 <button type="button">COPY</button></div></label>
              <label><span>Client seed</span><div className="fake-input">canasino-player-seed</div></label>
              <div className="verifier-split">
                <label><span>Nonce</span><div className="fake-input">42</div></label>
                <label><span>Game</span><div className="fake-input">Mines</div></label>
              </div>
              <button className="verify-button" disabled>Verify round · integration pending</button>
              <div className="verify-foot"><span>SHA-256 / deterministic result flow</span><span>On-chain proof ↗</span></div>
            </div>
          </section>

          <section className="vip-section content-width" id="vip">
            <div className="vip-banner">
              <div className="vip-copy">
                <span className="section-kicker">CASN CLUB</span>
                <h2>Make loyalty feel<br /><em>worth owning.</em></h2>
                <p>A rewards layer designed around the native CASN economy instead of opaque bonus balances.</p>
                <a className="secondary-button" href="#network">Explore CASN economy</a>
              </div>
              <div className="vip-levels" aria-label="Conceptual VIP progression">
                <span className="level level-1">I</span>
                <span className="level level-2">II</span>
                <span className="level level-3">III</span>
                <span className="level level-4">IV</span>
                <span className="level level-5">V</span>
                <div className="vip-line" />
              </div>
            </div>
            <div className="reward-grid">
              {rewards.map((reward) => (
                <article key={reward.title}><span className="reward-icon">{reward.icon}</span><div><h3>{reward.title}</h3><p>{reward.text}</p></div></article>
              ))}
            </div>
          </section>

          <section className="network-section content-width" id="network">
            <div className="network-intro">
              <span className="section-kicker">THE CASN NETWORK</span>
              <h2>Casino economics,<br /><em>at chain level.</em></h2>
              <p>Canasino launches with a fixed genesis configuration and a predictable emission schedule designed around long-term network participation.</p>
            </div>
            <div className="network-card">
              <div className="network-card-head"><span>CHAIN PARAMETERS</span><strong>CASN</strong></div>
              <div className="chain-stat-grid">
                {chainStats.map((stat) => <div key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong><small>{stat.unit}</small></div>)}
              </div>
              <div className="supply-block">
                <div className="supply-copy"><span>Long-term theoretical supply*</span><strong>~121.024M CASN</strong></div>
                <div className="supply-track"><span className="genesis-track" /><span className="emission-track" /></div>
                <div className="supply-key"><span><i className="gold-dot" />100M genesis</span><span><i className="green-dot" />~21.024M future emissions</span></div>
                <small>*Illustrative maximum based on the initial reward and repeated 730-day halvings.</small>
              </div>
            </div>
          </section>

          <section className="final-cta content-width">
            <span className="cta-suit">♠</span>
            <span className="section-kicker">A NEW KIND OF HOUSE</span>
            <h2>Play. Win.<br /><em>On-chain.</em></h2>
            <p>Canasino is building a transparent, verifiable and community-driven gaming network on the Canopy ecosystem.</p>
            <div><a className="primary-button" href="#games">Explore Canasino <Arrow /></a><a className="secondary-button" href="https://github.com/infoboy27/canasino" target="_blank" rel="noreferrer">View GitHub</a></div>
          </section>
        </main>

        <footer className="footer" id="footer">
          <div className="content-width footer-grid">
            <div><Brand /><p>Transparent gaming infrastructure for the next generation of crypto-native entertainment.</p></div>
            <div className="footer-links"><div><strong>CASINO</strong><a href="#games">Originals</a><a href="#activity">Activity</a><a href="#vip">VIP Club</a></div><div><strong>PROTOCOL</strong><a href="#fairness">Provably Fair</a><a href="#network">CASN Network</a><a href="https://github.com/infoboy27/canasino" target="_blank" rel="noreferrer">GitHub</a></div></div>
          </div>
          <div className="content-width footer-legal"><span>© 2026 Canasino</span><span>18+ · Play responsibly · Availability may vary by jurisdiction.</span></div>
        </footer>
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <a href="#casino"><span>⌂</span>Home</a>
        <a href="#games"><span>◆</span>Games</a>
        <button onClick={() => setWalletOpen(true)}><span>◈</span>Wallet</button>
        <a href="#vip"><span>♛</span>VIP</a>
        <a href="#fairness"><span>✓</span>Fairness</a>
      </nav>

      {walletOpen && <WalletModal onClose={() => setWalletOpen(false)} />}
    </div>
  )
}

export default App
