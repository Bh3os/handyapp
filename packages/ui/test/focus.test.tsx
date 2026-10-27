// Focus management of the shared components (TSK-0104; HH-A11Y-01, HH-A11Y-02): a dialog gives focus back to the
// control that opened it, whether it is closed or removed, and an in-app route change titles the page and moves focus
// to the main region unless the new screen already put it there; a box that scrolls sideways is in the tab order.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button, Dialog, ScrollArea, useRouteFocus } from '../src/index.js'

afterEach(cleanup)

describe('Dialog focus (TSK-0104, HH-A11Y-02)', () => {
  function Harness({ remove }: { remove: boolean }) {
    const [open, setOpen] = useState(false)
    const dialog = (
      <Dialog open={remove || open} title="Reset test data?" onClose={() => setOpen(false)}>
        <p>Body</p>
      </Dialog>
    )
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open</Button>
        {remove ? (open ? dialog : null) : dialog}
      </>
    )
  }

  it('[HH-A11Y-02] Escape closes the dialog and focus returns to the control that opened it', () => {
    render(<Harness remove={false} />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    expect(dialog.open).toBe(true)
    ;(dialog.querySelector('p') as HTMLElement).tabIndex = -1
    ;(dialog.querySelector('p') as HTMLElement).focus()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(dialog.open).toBe(false)
    expect(document.activeElement).toBe(trigger)
  })

  it('[HH-A11Y-02] a dialog the caller removes while open also gives focus back', () => {
    render(<Harness remove />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    expect(dialog.open).toBe(true)
    ;(dialog.querySelector('h2') as HTMLElement).tabIndex = -1
    ;(dialog.querySelector('h2') as HTMLElement).focus()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('ScrollArea (TSK-0104, HH-A11Y-02)', () => {
  it('[HH-A11Y-02] is a named region a keyboard user can reach and scroll', () => {
    render(
      <ScrollArea label="Estimated versus actual cost">
        <table>
          <tbody>
            <tr>
              <td>1</td>
            </tr>
          </tbody>
        </table>
      </ScrollArea>,
    )
    const region = screen.getByRole('region', { name: 'Estimated versus actual cost' })
    expect(region.tabIndex).toBe(0)
  })
})

describe('useRouteFocus (TSK-0104, HH-A11Y-01)', () => {
  function App({ route, focusHeading }: { route: string; focusHeading: boolean }) {
    useRouteFocus(route, 'main', `${route} – App`)
    return (
      <>
        <nav>
          <a href="#x">Menu</a>
        </nav>
        <main id="main" tabIndex={-1}>
          <Screen key={route} name={route} focusHeading={focusHeading} />
        </main>
      </>
    )
  }
  function Screen({ name, focusHeading }: { name: string; focusHeading: boolean }) {
    const h = useRef<HTMLHeadingElement>(null)
    useEffect(() => {
      if (focusHeading) h.current?.focus()
    }, [focusHeading])
    return (
      <h1 ref={h} tabIndex={-1}>
        {name}
      </h1>
    )
  }

  it('[HH-A11Y-01] titles the page, leaves focus alone on the first render and moves it to main on a change', () => {
    const { rerender } = render(<App route="Requests" focusHeading={false} />)
    expect(document.title).toBe('Requests – App')
    const menu = screen.getByRole('link', { name: 'Menu' })
    menu.focus()
    expect(document.activeElement).toBe(menu)
    act(() => rerender(<App route="Customers" focusHeading={false} />))
    expect(document.title).toBe('Customers – App')
    expect(document.activeElement).toBe(document.getElementById('main'))
  })

  it('[HH-A11Y-01] keeps focus that a new screen put inside the main region itself', () => {
    const { rerender } = render(<App route="Requests" focusHeading />)
    screen.getByRole('link', { name: 'Menu' }).focus()
    act(() => rerender(<App route="Customers" focusHeading />))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Customers' }))
  })
})
