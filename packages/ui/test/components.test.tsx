// Component behaviour (TSK-0018, HH-BASE-01): accessible names, errors, keyboard use and the functional states.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Button,
  Card,
  Dialog,
  Field,
  STATE_KINDS,
  StateView,
  StatusBadge,
  Tabs,
  ToastRegion,
  type ToastItem,
} from '../src/index.js'

afterEach(cleanup)

describe('Button (TSK-0018, HH-BASE-01)', () => {
  it('[HH-BASE-01] pending keeps the label, sets aria-busy and ignores a second press', () => {
    const onClick = vi.fn()
    render(
      <Button pending onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('[HH-BASE-01] is disabled only with its reason written beside it and linked to it', () => {
    render(<Button disabledReason="Add a description first.">Send</Button>)
    const button = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    const reason = screen.getByText('Add a description first.')
    expect(button.getAttribute('aria-describedby')).toBe(reason.id)
  })

  it('renders the variant classes and defaults to type="button"', () => {
    render(<Button variant="danger">Stop work</Button>)
    const button = screen.getByRole('button', { name: 'Stop work' })
    expect(button.className).toBe('hh-button hh-button--danger')
    expect(button.getAttribute('type')).toBe('button')
  })
})

describe('Field (TSK-0018, HH-BASE-01)', () => {
  it('[HH-BASE-01] labels the control and links the hint', () => {
    render(<Field label="ZIP code" hint="Five digits." />)
    const input = screen.getByLabelText('ZIP code')
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Five digits.')
  })

  it('[HH-BASE-01] an error sets aria-invalid and is announced through aria-describedby', () => {
    render(<Field label="ZIP code" hint="Five digits." error="Enter five digits." />)
    const input = screen.getByLabelText('ZIP code')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id))
    expect(described.map((el) => el?.textContent)).toEqual(['Five digits.', 'Enter five digits.'])
  })

  it('renders a text area and the required text from the caller', () => {
    render(<Field label="Describe the job" multiline required requiredText="required" />)
    const area = screen.getByRole('textbox', { name: /^Describe the job\s*\(required\)$/ })
    expect(area.tagName).toBe('TEXTAREA')
  })
})

describe('Card (TSK-0018, HH-BASE-01)', () => {
  it('renders a titled section and the plate variant', () => {
    render(
      <Card title="Plate" headingLevel={3} plate>
        <p>Body</p>
      </Card>,
    )
    const heading = screen.getByRole('heading', { level: 3, name: 'Plate' })
    expect(heading.closest('section')?.className).toBe('hh-card hh-card--plate')
  })
})

describe('Tabs (TSK-0018, HH-BASE-01)', () => {
  const tabs = [
    { id: 'a', label: 'Overview', content: <p>Overview panel</p> },
    { id: 'b', label: 'Messages', content: <p>Messages panel</p> },
    { id: 'c', label: 'Documents', content: <p>Documents panel</p> },
  ]

  it('[HH-BASE-01] follows the tabs pattern: one tab stop, arrows, Home and End', () => {
    render(<Tabs label="Project sections" tabs={tabs} />)
    const list = screen.getByRole('tablist', { name: 'Project sections' })
    const [first, second, third] = screen.getAllByRole('tab')
    expect(list).toBeTruthy()
    expect(first?.getAttribute('aria-selected')).toBe('true')
    expect([first, second, third].map((t) => t?.tabIndex)).toEqual([0, -1, -1])
    expect(screen.getByRole('tabpanel').textContent).toBe('Overview panel')

    fireEvent.keyDown(first as HTMLElement, { key: 'ArrowRight' })
    expect(second?.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(second)
    expect(screen.getByRole('tabpanel').textContent).toBe('Messages panel')

    fireEvent.keyDown(second as HTMLElement, { key: 'End' })
    expect(third?.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(third as HTMLElement, { key: 'ArrowRight' })
    expect(first?.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(first as HTMLElement, { key: 'ArrowLeft' })
    expect(third?.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(third as HTMLElement, { key: 'Home' })
    expect(first?.getAttribute('aria-selected')).toBe('true')
  })

  it('[HH-BASE-01] links each tab to its panel', () => {
    render(<Tabs label="Project sections" tabs={tabs} defaultSelectedId="b" />)
    const tab = screen.getByRole('tab', { name: 'Messages' })
    const panel = screen.getByRole('tabpanel')
    expect(tab.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id)
  })
})

describe('Dialog (TSK-0018, HH-BASE-01)', () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <Dialog open={open} title="Discard this draft?" onClose={() => setOpen(false)}>
          <p>Body</p>
        </Dialog>
      </>
    )
  }

  it('[HH-BASE-01] opens as a named dialog and closes on Escape (cancel)', () => {
    render(<Harness />)
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    expect(dialog.open).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(dialog.open).toBe(true)
    expect(screen.getByRole('dialog', { name: 'Discard this draft?' })).toBe(dialog)
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(dialog.open).toBe(false)
  })
})

describe('Toast (TSK-0018, HH-BASE-01)', () => {
  it('[HH-BASE-01] announces confirmations politely and errors as alerts; dismissal is explicit', () => {
    const toasts: ToastItem[] = [
      { id: '1', tone: 'success', message: 'Saved.' },
      { id: '2', tone: 'error', message: 'Not sent.' },
    ]
    const onDismiss = vi.fn()
    render(<ToastRegion toasts={toasts} onDismiss={onDismiss} dismissLabel="Dismiss" placement="inline" />)
    expect(screen.getByRole('status').textContent).toBe('Saved.')
    expect(screen.getByRole('alert').textContent).toBe('Not sent.')
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss' })[1] as HTMLElement)
    expect(onDismiss).toHaveBeenCalledWith('2')
  })
})

describe('StatusBadge (TSK-0018, HH-BASE-01)', () => {
  it('[HH-BASE-01] writes the status out; the tone only repeats it', () => {
    render(<StatusBadge tone="danger">On hold</StatusBadge>)
    const badge = screen.getByText('On hold')
    expect(badge.className).toBe('hh-badge hh-badge--danger')
    expect(badge.dataset['tone']).toBe('danger')
  })
})

describe('state views (TSK-0018, HH-BASE-01)', () => {
  it('[HH-BASE-01] provides empty, loading, error, stale, offline, blocked and success', () => {
    expect(STATE_KINDS).toEqual(['empty', 'loading', 'error', 'stale', 'offline', 'blocked', 'success'])
    for (const kind of STATE_KINDS) {
      const { container, unmount } = render(<StateView kind={kind} title={`State ${kind}`} />)
      const view = container.firstElementChild as HTMLElement
      expect(view.dataset['state']).toBe(kind)
      expect(view.className).toBe(`hh-state hh-state--${kind}`)
      expect(view.getAttribute('role')).toBe(kind === 'error' ? 'alert' : 'status')
      expect(view.getAttribute('aria-busy')).toBe(kind === 'loading' ? 'true' : null)
      expect(view.textContent).toContain(`State ${kind}`)
      unmount()
    }
  })

  it('[HH-BASE-01] a blocked view lists each missing item and offers one action', () => {
    render(
      <StateView
        kind="blocked"
        title="Work cannot start yet"
        reasons={['First missing item', 'Second missing item']}
        action={<Button variant="secondary">Open checklist</Button>}
      />,
    )
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'First missing item',
      'Second missing item',
    ])
    expect(screen.getByRole('button', { name: 'Open checklist' })).toBeTruthy()
  })
})
