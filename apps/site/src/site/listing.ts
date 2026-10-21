// Which services the public site lists (TSK-0021; HH-CUS-01, OWN-DEC-84). The static build carries every registry
// service hidden; GET /api/v1/public/services says which the site may show in this environment (production: owner
// approved and published; staging, local and ci: shown on staging or published). Unknown is not safe: while the list
// cannot be read, no service is listed. Pure functions, unit tested; the page scripts call them.

/** The IDs the response lists, or null when it is not the documented shape. */
export function parseListedIds(body: unknown): Set<string> | null {
  if (typeof body !== 'object' || body === null) return null
  const services = (body as Record<string, unknown>)['services']
  if (!Array.isArray(services)) return null
  const ids = new Set<string>()
  for (const s of services) {
    const id = typeof s === 'object' && s !== null ? (s as Record<string, unknown>)['id'] : undefined
    if (typeof id !== 'string') return null
    ids.add(id)
  }
  return ids
}

/**
 * Shows the listed services inside `root`: each `[data-service-id]` item is shown only when listed; each
 * `[data-listing-group]` shows its `[data-listing-empty]` note when none of its items is; `[data-listing-status]`
 * shows `unavailable` when the list could not be read and is hidden otherwise.
 */
export function applyListing(root: ParentNode, ids: Set<string> | null, unavailable: string): void {
  const status = root.querySelector<HTMLElement>('[data-listing-status]')
  for (const item of root.querySelectorAll<HTMLElement>('[data-service-id]'))
    item.hidden = !ids?.has(item.dataset['serviceId'] ?? '')
  if (!ids) {
    if (status) {
      status.textContent = unavailable
      status.hidden = false
    }
    return
  }
  if (status) status.hidden = true
  for (const group of root.querySelectorAll<HTMLElement>('[data-listing-group]')) {
    const shown = [...group.querySelectorAll<HTMLElement>('[data-service-id]')].some((i) => !i.hidden)
    const empty = group.querySelector<HTMLElement>('[data-listing-empty]')
    if (empty) empty.hidden = shown
    const list = group.querySelector<HTMLElement>('[data-listing-list]')
    if (list) list.hidden = !shown
  }
}

/** Reads the list and applies it to every `[data-service-listing]` element on the page. */
export function loadListing(doc: Document = document): void {
  const roots = [...doc.querySelectorAll<HTMLElement>('[data-service-listing]')]
  if (!roots.length) return
  const apply = (ids: Set<string> | null) => {
    for (const root of roots) applyListing(root, ids, root.dataset['unavailable'] ?? '')
  }
  fetch('/api/v1/public/services', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json() : null))
    .then((body: unknown) => apply(parseListedIds(body)))
    .catch(() => apply(null))
}
