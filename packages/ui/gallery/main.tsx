// Component gallery (TSK-0018, HH-BASE-01). Sample text only; nothing here is a business fact. `?theme=dark` or
// `?theme=light` pins the theme for the screenshots; without it the page follows the system setting.
import '../styles/index.css'
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BRAND,
  Button,
  Card,
  Dialog,
  Field,
  StateView,
  StatusBadge,
  Tabs,
  ToastRegion,
  type ToastItem,
} from '../src/index.js'

const theme = new URLSearchParams(window.location.search).get('theme')
if (theme === 'dark' || theme === 'light') document.documentElement.dataset['theme'] = theme

function Gallery() {
  const [open, setOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([
    { id: 't1', tone: 'success', message: 'Request saved.' },
    { id: 't2', tone: 'info', message: 'A newer version of this page is available.' },
    { id: 't3', tone: 'error', message: 'The note was not sent. Try again.' },
  ])

  return (
    <main className="gallery">
      <header className="gallery__header">
        <h1 className="hh-h1">Component gallery</h1>
        <p className="hh-lead">HandyHub design system: tokens, components and functional states. Sample text only.</p>
      </header>

      <section aria-labelledby="g-colour">
        <h2 id="g-colour" className="hh-h2">
          Colour
        </h2>
        <ul className="gallery__swatches">
          {Object.entries(BRAND).map(([name, value]) => (
            <li key={name}>
              <span className="gallery__swatch" style={{ background: value }} aria-hidden="true" />
              <span>{name}</span> <code>{value}</code>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="g-type">
        <h2 id="g-type" className="hh-h2">
          Typography
        </h2>
        <p className="hh-display">Professional care for every corner of your property.</p>
        <p className="hh-h1">Page title in Newsreader</p>
        <p className="hh-h2">Section title in Newsreader</p>
        <h3>Card title in Source Sans 3</h3>
        <p>Body text in Source Sans 3 reads at a comfortable measure for forms, lists and notes.</p>
        <p className="hh-small hh-muted">Small secondary text for hints and captions.</p>
        <p>
          A <a href="#g-type">link in running text</a> is underlined.
        </p>
      </section>

      <section aria-labelledby="g-buttons">
        <h2 id="g-buttons" className="hh-h2">
          Buttons
        </h2>
        <div className="hh-button-row">
          <Button>Request an estimate</Button>
          <Button variant="secondary">Explore services</Button>
          <Button variant="quiet">Show details</Button>
          <Button variant="danger">Stop work</Button>
        </div>
        <div className="hh-button-row gallery__gap">
          <Button pending>Saving</Button>
          <Button disabledReason="Add a description first.">Send request</Button>
        </div>
      </section>

      <section aria-labelledby="g-fields">
        <h2 id="g-fields" className="hh-h2">
          Fields
        </h2>
        <div className="gallery__stack">
          <Field label="Full name" autoComplete="name" required requiredText="required" />
          <Field
            label="ZIP code"
            hint="Five digits."
            inputMode="numeric"
            defaultValue="4020"
            error="Enter five digits."
          />
          <Field label="Describe the job" hint="What needs doing, and where." multiline />
        </div>
      </section>

      <section aria-labelledby="g-cards">
        <h2 id="g-cards" className="hh-h2">
          Cards
        </h2>
        <div className="gallery__grid">
          <Card title="Card" headingLevel={3}>
            <p>A raised surface with a hairline border for grouped content.</p>
          </Card>
          <Card title="Plate" headingLevel={3} plate>
            <p>The signature panel, with a gold hairline along its top edge.</p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="g-tabs">
        <h2 id="g-tabs" className="hh-h2">
          Tabs
        </h2>
        <Tabs
          label="Project sections"
          tabs={[
            { id: 'overview', label: 'Overview', content: <p>Overview panel.</p> },
            { id: 'messages', label: 'Messages', content: <p>Messages panel.</p> },
            { id: 'documents', label: 'Documents', content: <p>Documents panel.</p> },
          ]}
        />
      </section>

      <section aria-labelledby="g-dialog">
        <h2 id="g-dialog" className="hh-h2">
          Dialog
        </h2>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open dialog
        </Button>
        <Dialog
          open={open}
          title="Discard this draft?"
          onClose={() => setOpen(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Keep editing
              </Button>
              <Button variant="danger" onClick={() => setOpen(false)}>
                Discard
              </Button>
            </>
          }
        >
          <p>The draft stays on this device until you discard it.</p>
        </Dialog>
      </section>

      <section aria-labelledby="g-toasts">
        <h2 id="g-toasts" className="hh-h2">
          Toasts
        </h2>
        <ToastRegion
          placement="inline"
          toasts={toasts}
          dismissLabel="Dismiss"
          onDismiss={(id) => setToasts((all) => all.filter((t) => t.id !== id))}
        />
      </section>

      <section aria-labelledby="g-badges">
        <h2 id="g-badges" className="hh-h2">
          Status badges
        </h2>
        <div className="hh-button-row">
          <StatusBadge tone="success">Ready</StatusBadge>
          <StatusBadge tone="danger">On hold</StatusBadge>
          <StatusBadge tone="warning">Needs attention</StatusBadge>
          <StatusBadge tone="info">In progress</StatusBadge>
          <StatusBadge>Draft</StatusBadge>
        </div>
      </section>

      <section aria-labelledby="g-states">
        <h2 id="g-states" className="hh-h2">
          States
        </h2>
        <div className="gallery__stack">
          <StateView kind="empty" title="No requests yet">
            New requests appear here.
          </StateView>
          <StateView kind="loading" title="Loading requests" />
          <StateView
            kind="error"
            title="The requests could not be loaded"
            action={<Button variant="secondary">Retry</Button>}
          >
            Nothing was changed. Try again.
          </StateView>
          <StateView
            kind="stale"
            title="This list may be out of date"
            action={<Button variant="secondary">Refresh</Button>}
          >
            Last updated at 9:41.
          </StateView>
          <StateView kind="offline" title="You are offline">
            Your notes are kept on this device. Not yet synchronized.
          </StateView>
          <StateView
            kind="blocked"
            title="Work cannot start yet"
            reasons={['Sample missing item one', 'Sample missing item two']}
          >
            Each missing item is listed.
          </StateView>
          <StateView kind="success" title="Request received">
            The reference is on its way by email.
          </StateView>
        </div>
      </section>
    </main>
  )
}

const style = document.createElement('style')
style.textContent = `
  .gallery { max-width: var(--hh-wrap); margin: 0 auto; padding: var(--hh-space-8) var(--hh-gutter) var(--hh-space-16); }
  .gallery > section { margin-top: var(--hh-space-12); }
  .gallery__swatches { display: flex; flex-wrap: wrap; gap: var(--hh-space-4); margin: 0; padding: 0; list-style: none; }
  .gallery__swatches li { display: flex; align-items: center; gap: var(--hh-space-2); }
  .gallery__swatch { display: inline-block; width: 2.5rem; height: 2.5rem; border: var(--hh-hairline); border-radius: var(--hh-radius-sm); }
  .gallery__stack { display: grid; gap: var(--hh-space-4); max-width: 40rem; }
  .gallery__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: var(--hh-space-6); }
  .gallery__gap { margin-top: var(--hh-space-4); }
`
document.head.append(style)

const root = document.getElementById('root')
if (!root) throw new Error('missing #root element')
createRoot(root).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
)
