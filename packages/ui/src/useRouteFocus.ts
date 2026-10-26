import { useEffect, useRef } from 'react'

/**
 * Focus and title on an in-app route change (TSK-0104; HH-A11Y-01, WCAG 2.4.2 and 2.4.3). The single-page apps change
 * screens without loading a page, so the browser neither announces a new page nor moves focus: after the route key
 * changes, the document title names the new screen, and focus moves to the main region (`mainId`, which carries
 * tabIndex={-1}) so the next Tab starts at the new screen's content. A screen that already moved focus into the main
 * region itself (a heading, an error summary, a tab the person is on) keeps it. Nothing happens on the first render.
 */
export function useRouteFocus(routeKey: string, mainId: string, title?: string): void {
  const previous = useRef<string | null>(null)
  useEffect(() => {
    if (title !== undefined) document.title = title
  }, [title])
  useEffect(() => {
    const was = previous.current
    previous.current = routeKey
    if (was === null || was === routeKey) return
    const main = document.getElementById(mainId)
    if (!main) return
    const active = document.activeElement
    if (active && active !== document.body && main.contains(active)) return
    main.focus({ preventScroll: true })
  }, [routeKey, mainId])
}
