import { useState } from 'react'

const chainStats = [
  { label: 'Genesis supply', value: '100M', unit: 'CASN' },
  { label: 'Block time', value: '6', unit: 'SECONDS' },
  { label: 'Block reward', value: '1', unit: 'CASN' },
  { label: 'Halving', value: '730', unit: 'DAYS' },
]

const games = [
  {
    name: 'Roulette',
    mark: '●',
    eyebrow: 'CLASSIC',
    description: 'Transparent roulette with verifiable outcomes and on-chain settlement.',
  },
  {
    name: 'Blackjack',
    mark: '♠',
    eyebrow: 'TABLE',
    description: 'Fast table play with auditable wagers, outcomes and player rewards.',
  },
  {
    name: 'Poker',
    mark: '♦',
    eyebrow: 'COMPETITIVE',
    description: 'On-chain tournaments, transparent prize pools and competitive play.',
  },
  {
    name: 'Bingo',
    mark: '◆',
    eyebrow: 'SOCIAL',
    description: 'Community-driven rooms, jackpots and verifiable winner selection.',
  },
]

const pillars = [
  {
    number: '01',
    title: 'Provably fair',
    text: 'Game outcomes are designed to be verifiable, giving players a transparent way to validate how results are produced.',
  },
  {
    number: '02',
    title: 'On-chain settlement',
    text: 'Wagers, payouts and tournament prize pools can settle transparently through the Canasino network.',
  },
  {
    number: '03',
    title: 'Player-first economy',
    text: 'CASN powers gameplay, rewards and the broader gaming economy across the Canasino ecosystem.',
  },
]

function Logo({ compact = false }) {
  return (
    <a className="brand" href="#top" aria-label="Canasino home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" role="img">
          <circle cx="32" cy="32" r="29" className="logo-ring" />
          <path d="M40.6 20.6c-2.4-2.1-5.3-3.2-8.6-3.2-8.1 0-14.4 6.4-14.4 14.6 0 8.3 6.3 14.6 14.4 14.6 3.6 0 6.8-1.2 9.2-3.6l-4.4-5.2a7 7 0 0 1-4.6 1.7c-4.1 0-7-3.2-7-7.5s2.9-7.5 7-7.5c1.8 0 3.3.6 4.6 1.7l3.8-5.6Z" className="logo-c" />
          <path d="M37.5 31.8 48.7 22l-2.3 12.4 7.1 3.9-11.2 1.2-4.8-7.7Z" className="logo-leaf" />
        </svg>
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>CANASINO</strong>
          <small>ON-CHAIN GAMING</small>
        </span>
      )}
    </a>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 20 6v5c0 5.2-3.2 8.4-8 10-4.8-1.6-8-4.8-8-10V6l8-3Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="m8.4 12 2.2 2.2 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  return (
    <main id="top">
      <div className="noise" />
      <header className="site-header">
        <div className="container nav-wrap">
          <Logo />

          <nav className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Primary navigation">
            <a href="#games" onClick={closeMenu}>Games</a>
            <a href="#fairness" onClick={closeMenu}>Why Canasino</a>
            <a href="#token" onClick={closeMenu}>CASN</a>
            <a href="#network" onClick={closeMenu}>Network</a>
            <a href="#about" onClick={closeMenu}>About</a>
          </nav>

          <div className="nav-actions">
            <a className="nav-status" href="#network">
              <span /> NETWORK LIVE
            </a>
            <a className="button button-small" href="#games">Enter Canasino</a>
            <button
              className="menu-toggle"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <section className="hero section-shell">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span /> BUILT ON THE CANOPY ECOSYSTEM</div>
            <h1>
              The house is<br />
              <em>on-chain.</em>
            </h1>
            <p className="hero-lead">
              Casino gaming rebuilt around transparent outcomes, on-chain settlement and a player-first economy powered by <strong>CASN</strong>.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#games">
                Explore the casino <ArrowIcon />
              </a>
              <a className="button button-ghost" href="#network">Explore the chain</a>
            </div>
            <div className="trust-row">
              <div><ShieldIcon /><span>Provably fair</span></div>
              <div><span className="trust-dot" /><span>On-chain settlement</span></div>
              <div><span className="trust-dot" /><span>Transparent rewards</span></div>
            </div>
          </div>

          <div className="hero-visual" aria-label="Canasino CASN gaming token visual">
            <div className="table-light table-light-one" />
            <div className="table-light table-light-two" />
            <div className="floating-card card-left">
              <span className="card-corner">A<br />♠</span>
              <span className="card-suit">♠</span>
              <span className="card-corner card-corner-bottom">A<br />♠</span>
            </div>
            <div className="floating-card card-right">
              <span className="card-corner red">K<br />♦</span>
              <span className="card-suit red">♦</span>
              <span className="card-corner card-corner-bottom red">K<br />♦</span>
            </div>
            <div className="token-halo" />
            <div className="token-chip">
              <div className="chip-notches" />
              <div className="chip-inner">
                <span className="chip-kicker">CANASINO</span>
                <div className="chip-symbol">C</div>
                <strong>CASN</strong>
                <small>PLAY · WIN · ON-CHAIN</small>
              </div>
            </div>
            <div className="visual-badge badge-top">
              <span className="live-pip" />
              <div><small>NETWORK</small><strong>LIVE</strong></div>
            </div>
            <div className="visual-badge badge-bottom">
              <small>NATIVE TOKEN</small>
              <strong>CASN</strong>
            </div>
          </div>
        </div>

        <div className="container stats-panel" id="network">
          {chainStats.map((stat) => (
            <div className="stat" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.unit}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="games-section section-shell" id="games">
        <div className="container">
          <div className="section-heading split-heading">
            <div>
              <div className="eyebrow"><span /> THE FLOOR</div>
              <h2>Games built for<br /><em>verifiable play.</em></h2>
            </div>
            <p>
              A growing casino ecosystem designed around transparent mechanics, competitive play and instant digital ownership.
            </p>
          </div>

          <div className="game-grid">
            {games.map((game, index) => (
              <article className={`game-card game-card-${index + 1}`} key={game.name}>
                <div className="game-topline">
                  <span>{game.eyebrow}</span>
                  <span className="coming-soon">COMING SOON</span>
                </div>
                <div className="game-mark">{game.mark}</div>
                <div className="game-card-body">
                  <h3>{game.name}</h3>
                  <p>{game.description}</p>
                  <span className="game-link">View game <ArrowIcon /></span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="fair-section section-shell" id="fairness">
        <div className="container fair-grid">
          <div className="fair-intro">
            <div className="eyebrow"><span /> TRUST, REBUILT</div>
            <h2>Don't trust the house.<br /><em>Verify it.</em></h2>
            <p>
              Traditional casinos ask you to trust a black box. Canasino is being designed around auditable game mechanics and transparent value flows.
            </p>
            <a className="text-link" href="#token">Discover CASN <ArrowIcon /></a>
          </div>
          <div className="pillar-list">
            {pillars.map((pillar) => (
              <article className="pillar" key={pillar.number}>
                <span className="pillar-number">{pillar.number}</span>
                <div>
                  <h3>{pillar.title}</h3>
                  <p>{pillar.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="token-section section-shell" id="token">
        <div className="container token-grid">
          <div className="token-copy">
            <div className="eyebrow"><span /> THE CASN ECONOMY</div>
            <h2>One token.<br /><em>Every table.</em></h2>
            <p>
              CASN is the native asset of Canasino, designed to power gameplay, rewards, tournaments and the network economy.
            </p>
            <div className="token-tags">
              <span>GAMEPLAY</span>
              <span>REWARDS</span>
              <span>TOURNAMENTS</span>
              <span>NETWORK</span>
            </div>
          </div>

          <div className="tokenomics-card">
            <div className="tokenomics-head">
              <div>
                <small>GENESIS SUPPLY</small>
                <strong>100,000,000</strong>
                <span>CASN</span>
              </div>
              <div className="mini-chip">C</div>
            </div>
            <div className="supply-bar">
              <span className="supply-genesis" />
              <span className="supply-emissions" />
            </div>
            <div className="supply-legend">
              <div><span className="legend-dot genesis" /><p><strong>100M</strong> Genesis</p></div>
              <div><span className="legend-dot emissions" /><p><strong>~21.024M</strong> Future emissions*</p></div>
            </div>
            <div className="tokenomics-stats">
              <div><span>Initial reward</span><strong>1 CASN</strong></div>
              <div><span>Halving cycle</span><strong>730 days</strong></div>
              <div><span>Block time</span><strong>6 sec</strong></div>
              <div><span>Long-term supply*</span><strong>~121.024M</strong></div>
            </div>
            <small className="token-note">*Illustrative maximum based on the initial emission schedule and repeated halvings.</small>
          </div>
        </div>
      </section>

      <section className="manifesto section-shell" id="about">
        <div className="container manifesto-inner">
          <div className="manifesto-mark">♠</div>
          <div className="eyebrow centered"><span /> A NEW KIND OF HOUSE</div>
          <h2>Play. Win.<br /><em>On-chain.</em></h2>
          <p>
            Canasino is building a transparent, verifiable and community-driven gaming network on the Canopy ecosystem.
          </p>
          <a className="button button-primary" href="#games">Enter the ecosystem <ArrowIcon /></a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container footer-main">
          <div className="footer-brand">
            <Logo />
            <p>Transparent gaming infrastructure for the next generation of on-chain entertainment.</p>
          </div>
          <div className="footer-links">
            <div><strong>EXPLORE</strong><a href="#games">Games</a><a href="#fairness">Why Canasino</a><a href="#token">CASN</a></div>
            <div><strong>NETWORK</strong><a href="#network">Chain stats</a><a href="#token">Tokenomics</a><a href="https://github.com/infoboy27/canasino" target="_blank" rel="noreferrer">GitHub</a></div>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© 2026 Canasino. All rights reserved.</span>
          <span>18+ · Play responsibly · Availability may vary by jurisdiction.</span>
        </div>
      </footer>
    </main>
  )
}

export default App
