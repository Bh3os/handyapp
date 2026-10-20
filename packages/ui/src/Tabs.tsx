import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface TabItem {
  id: string
  label: string
  content: ReactNode
}

export interface TabsProps {
  /** Accessible name of the tab list. */
  label: string
  tabs: readonly TabItem[]
  /** Controlled selection; omit to let the component keep it. */
  selectedId?: string
  defaultSelectedId?: string
  onSelect?: (id: string) => void
}

/**
 * Tabs (WAI-ARIA tabs pattern, automatic activation): one tab stop; Left/Right move and select, Home/End go to the ends.
 */
export function Tabs({ label, tabs, selectedId, defaultSelectedId, onSelect }: TabsProps) {
  const base = useId()
  const [own, setOwn] = useState(defaultSelectedId ?? tabs[0]?.id)
  const current = selectedId ?? own
  const refs = useRef(new Map<string, HTMLButtonElement>())

  const select = (id: string, focus: boolean) => {
    if (selectedId === undefined) setOwn(id)
    onSelect?.(id)
    if (focus) refs.current.get(id)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined
    if (next === undefined) return
    event.preventDefault()
    const tab = tabs[next]
    if (tab) select(tab.id, true)
  }

  return (
    <div className="hh-tabs">
      <div className="hh-tabs__list" role="tablist" aria-label={label}>
        {tabs.map((tab, index) => {
          const selected = tab.id === current
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) refs.current.set(tab.id, el)
                else refs.current.delete(tab.id)
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              className="hh-tabs__tab"
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id, false)}
              onKeyDown={(e) => onKeyDown(e, index)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          className="hh-tabs__panel"
          aria-labelledby={`${base}-tab-${tab.id}`}
          tabIndex={0}
          hidden={tab.id !== current}
        >
          {tab.content}
        </div>
      ))}
    </div>
  )
}
