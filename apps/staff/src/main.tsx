import '@handyhub/ui/styles.css'
import './staff.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { announceUpdate } from './offline/SyncStatus'

const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')
// TSK-0079 (HH-OFF-01): the service worker keeps the app itself available offline (never an API answer). Registered
// in a built app only, next to the page: /staff/sw.js on a single host, /sw.js at the root of the staff host.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const base = window.location.pathname.startsWith('/staff/') || window.location.pathname === '/staff' ? '/staff/' : '/'
  // TSK-0080 (T52): a new version waits; the app's update banner asks first (APP_UPDATE), and the page reloads once
  // the new version took over.
  const hadController = Boolean(navigator.serviceWorker.controller)
  const announce = (worker: ServiceWorker | null) => {
    if (worker && navigator.serviceWorker.controller) announceUpdate(worker)
  }
  void navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .then((reg) => {
      announce(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const next = reg.installing
        next?.addEventListener('statechange', () => {
          if (next.state === 'installed') announce(next)
        })
      })
    })
    .catch(() => undefined)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The first version taking over a page it did not serve is no update: nothing to reload.
    if (reloading || !hadController) return
    reloading = true
    window.location.reload()
  })
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
