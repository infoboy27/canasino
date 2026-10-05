import React from 'react'
import ReactDOM from 'react-dom/client'
import Experience from './Experience'

function render() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Experience />
    </React.StrictMode>,
  )
}

// Dev-only mock wallet (see src/dev/mockFleet.js); `import.meta.env.DEV` is false in
// production builds, so this branch and its module are dropped from the bundle.
if (import.meta.env.DEV && import.meta.env.VITE_DEV_WALLET_URL) {
  import('./dev/mockFleet.js').then((m) => m.installMockFleet(import.meta.env.VITE_DEV_WALLET_URL)).finally(render)
} else {
  render()
}
