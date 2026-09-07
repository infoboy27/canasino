// A small, deliberate icon set replacing loose unicode glyphs (⌂◆◉✓♛↺✦⚑).
// One consistent line style — 1.6px stroke, round joins, 24x24 — so the
// mark reads as a designed system rather than mixed placeholder characters.
const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function IconHome(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 19v-5h4v5" />
    </svg>
  )
}

export function IconChip(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3.6v3M12 17.4v3M3.6 12h3M17.4 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M17.7 6.3l-2.1 2.1M8.4 15.6l-2.1 2.1" />
    </svg>
  )
}

export function IconBroadcast(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M8.3 8.3a5.2 5.2 0 0 0 0 7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4" />
      <path d="M5.3 5.3a9.6 9.6 0 0 0 0 13.4M18.7 5.3a9.6 9.6 0 0 1 0 13.4" />
    </svg>
  )
}

export function IconShieldCheck(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 5 6v5.5c0 4.4 3 7.7 7 9 4-1.3 7-4.6 7-9V6l-7-2.5Z" />
      <path d="m8.7 12 2.2 2.2 4.4-4.6" />
    </svg>
  )
}

export function IconLaurel(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v13" />
      <path d="M12 18c-2.4-.6-4-2.7-4-5" />
      <path d="M12 18c2.4-.6 4-2.7 4-5" />
      <path d="M6 6.6c1.6.2 2.7 1.6 2.6 3.3M18 6.6c-1.6.2-2.7 1.6-2.6 3.3M4.6 10.4c1.5.5 2.3 2 1.9 3.6M19.4 10.4c-1.5.5-2.3 2-1.9 3.6" />
    </svg>
  )
}

export function IconGithub(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" {...props}>
      <path d="M12 2a10 10 0 0 0-3.16 19.5c.5.1.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.15-1.11-1.46-1.11-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.99 1.03-2.68-.1-.26-.45-1.28.1-2.66 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.9-1.3 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.66.64.69 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85v2.75c0 .26.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  )
}

export function IconCoinLoop(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 12a8 8 0 0 1 13.6-5.7" />
      <path d="M20 12a8 8 0 0 1-13.6 5.7" />
      <path d="M17.6 3.7v3.2h-3.2M6.4 20.3v-3.2h3.2" />
    </svg>
  )
}

export function IconStarBadge(props) {
  return (
    <svg {...base} {...props}>
      <path d="m12 4 1.9 4.1 4.4.5-3.3 3 .9 4.4L12 13.8 8.1 16l.9-4.4-3.3-3 4.4-.5L12 4Z" />
    </svg>
  )
}

export function IconBracket(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 5h4v4H5zM5 15h4v4H5zM15 10h4v4h-4z" />
      <path d="M9 7h3v6a3 3 0 0 0 3 3M9 17h3v-4" />
    </svg>
  )
}

export function IconSparkle(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5c.5 3 1.9 4.4 4.9 4.9-3 .5-4.4 1.9-4.9 4.9-.5-3-1.9-4.4-4.9-4.9 3-.5 4.4-1.9 4.9-4.9Z" />
      <path d="M18.5 15c.3 1.6 1 2.3 2.6 2.6-1.6.3-2.3 1-2.6 2.6-.3-1.6-1-2.3-2.6-2.6 1.6-.3 2.3-1 2.6-2.6Z" />
    </svg>
  )
}
