import '@handyhub/ui/styles.css'
import './staff.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')
// TSK-0079 (HH-OFF-01): the service worker keeps the app itself available offline (never an API answer). Registered
// in a built app only, next to the page: /staff/sw.js on a single host, /sw.js at the root of the staff host.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const base = window.location.pathname.startsWith('/staff/') || window.location.pathname === '/staff' ? '/staff/' : '/'
  void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => undefined)
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
