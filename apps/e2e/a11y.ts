// The accessibility sweep's checks (TSK-0104; HH-A11Y-01, HH-A11Y-02, HH-A11Y-03, T69, OWN-DEC-85, OWN-DEC-181). Each
// check runs in the real browser on the screen as it stands and returns what it found, written out, so a spec can
// assert an empty list and a failure names the rule and the elements. What these checks cannot see (a real screen
// reader, a physical phone, switch access, voice control) stays UNVERIFIED in docs/accessibility-report.md.
import { appendFileSync } from 'node:fs'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Locator, type Page } from '@playwright/test'

/** WCAG 2.0, 2.1 and 2.2 level A and AA rules (axe-core tags), the same set every spec scans with. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

/** The axe rules that depend on colour, rerun in the dark theme (1.4.1, 1.4.3). */
const DARK_RULES = ['color-contrast', 'link-in-text-block']

/** The desktop size the theme and text-size checks use; 320 px is the reflow width (WCAG 1.4.10). */
export const DESKTOP = { width: 1280, height: 800 }
export const PHONE = { width: 320, height: 640 }

/** axe on the page as it is: each violation with the elements it found. */
export async function axeViolations(page: Page, rules?: string[]): Promise<string[]> {
  await settled(page)
  // A sandboxed frame runs no script, so axe cannot enter it and waits for it each run: the staff app's email preview
  // (the owner's message wording as the customer gets it) is such a frame, and emails are outside this check.
  const builder = new AxeBuilder({ page }).exclude('iframe[sandbox]')
  const scan = await (rules ? builder.withRules(rules) : builder.withTags(WCAG_TAGS)).analyze()
  return scan.violations.map((v) => `${v.id}: ${v.help} [${v.nodes.map((n) => n.target.join(' ')).join(', ')}]`)
}

/**
 * Horizontal scrolling of the page itself (WCAG 1.4.10): the elements that stick out past the right edge of the
 * viewport. A wide table inside its own scrolling box is allowed (two-dimensional content), so is anything a scrolling
 * ancestor clips.
 */
export async function horizontalOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const doc = document.documentElement
    const width = doc.clientWidth
    if (doc.scrollWidth <= width + 1) return []
    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : ''
      const cls =
        typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''
      const type = el.getAttribute('type') ? `[type=${el.getAttribute('type')}]` : ''
      return `${el.tagName.toLowerCase()}${type}${id}${cls}`
    }
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true
      }
      return false
    }
    const out: string[] = []
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.right <= width + 1 || clipped(el)) continue
      // Only the innermost offenders: a parent that sticks out only because of this child is not named again.
      if (Array.from(el.children).some((c) => c.getBoundingClientRect().right > width + 1)) continue
      const parent = el.parentElement ? ` in ${describe(el.parentElement)}` : ''
      out.push(`${describe(el)}${parent} (right edge ${Math.round(r.right)} px > ${width} px)`)
      if (out.length >= 10) break
    }
    return out.length > 0 ? out : [`page is ${doc.scrollWidth} px wide in a ${width} px viewport`]
  })
}

/**
 * Text resized to 200% (WCAG 1.4.4): the root font size doubled, as a browser's text-size setting does, so every
 * size set in rem or em doubles; 100 puts it back.
 */
export async function setTextSize(page: Page, percent: number): Promise<void> {
  await page.evaluate((p) => {
    document.documentElement.style.fontSize = p === 100 ? '' : `${p}%`
  }, percent)
}

/**
 * Motion with prefers-reduced-motion: reduce (WCAG 2.3.3, HH-A11Y-01): animations or transitions still longer than a
 * blink. Call after page.emulateMedia({ reducedMotion: 'reduce' }).
 */
export async function motionUnderReduce(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seconds = (v: string) =>
      Math.max(...v.split(',').map((s) => (s.trim().endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s) || 0)))
    const out: string[] = []
    for (const el of Array.from(document.querySelectorAll('*'))) {
      for (const pseudo of [null, '::before', '::after']) {
        const s = getComputedStyle(el, pseudo)
        const animated = s.animationName !== 'none' && seconds(s.animationDuration) > 0.01
        const transition = s.transitionProperty !== 'none' && seconds(s.transitionDuration) > 0.01
        if (animated || transition)
          out.push(
            `${el.tagName.toLowerCase()}.${String(el.className)}${pseudo ?? ''} (${animated ? s.animationName : 'transition'})`,
          )
      }
    }
    return out.slice(0, 10)
  })
}

/**
 * Target size (HH-A11Y-03): controls smaller than `min` CSS pixels in height or width. Buttons, form controls and
 * links styled as buttons or menu entries count; a link inside a sentence is exempt (WCAG 2.5.8 inline exception), as
 * are checkboxes and radio buttons whose label is part of the target.
 */
export async function smallTargets(page: Page, min: number): Promise<string[]> {
  return page.evaluate((m) => {
    const out: string[] = []
    const controls = document.querySelectorAll<HTMLElement>(
      'button, select, textarea, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), a[class], summary',
    )
    for (const el of Array.from(controls)) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (el.closest('.hh-visually-hidden')) continue
      // A link that flows inside text: its parent's text runs around it.
      if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue
      if (r.height < m - 0.5 || r.width < m - 0.5) {
        const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)
        out.push(
          `${el.tagName.toLowerCase()}.${String(el.className)} "${label}" ${Math.round(r.width)}×${Math.round(r.height)}`,
        )
      }
    }
    return out.slice(0, 15)
  }, min)
}

/**
 * Switches the emulated colour scheme or motion setting and waits for the colour transitions it starts to end, so
 * axe measures the settled colours and not a button halfway between two themes.
 */
export async function emulate(page: Page, media: Parameters<Page['emulateMedia']>[0]): Promise<void> {
  await page.emulateMedia(media)
  await settled(page)
}

/** Waits for the finite animations and transitions running now to end (a loading spinner turns for ever). */
async function settled(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
      // A transition that never runs (a hidden element) must not hold the check.
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]),
  )
}

/**
 * Every check of one screen state: axe in the light and dark themes and at 320 px, no horizontal scrolling at 320 px
 * (the reflow width, which is also 400% zoom of a 1280 px window) or with 200% text at 1280 px, controls of at least
 * 44 px on the phone (HH-A11Y-03), and no motion when reduced motion is asked for. Returns the findings, each
 * prefixed with the check; the page is left as it was found (its viewport, no emulated theme or motion, 100% text).
 */
export async function sweep(page: Page, label = page.url()): Promise<string[]> {
  const found: string[] = []
  const add = (check: string, items: string[]) => found.push(...items.map((i) => `${label} — ${check}: ${i}`))
  const viewport = page.viewportSize() ?? DESKTOP
  try {
    // The pointer rests outside the page, so no control is measured in its hover colours.
    await page.mouse.move(0, 0)
    await emulate(page, { colorScheme: 'light', reducedMotion: 'no-preference' })
    add('axe light', await axeViolations(page))
    await emulate(page, { colorScheme: 'dark' })
    // Only colours change with the theme, so the dark run checks the colour rules.
    add('axe dark', await axeViolations(page, DARK_RULES))
    await emulate(page, { colorScheme: 'light' })
    await page.setViewportSize({ width: DESKTOP.width, height: viewport.height })
    await setTextSize(page, 200)
    add('200% text', await horizontalOverflow(page))
    await setTextSize(page, 100)
    await page.setViewportSize(PHONE)
    add('320 px', await horizontalOverflow(page))
    add('axe 320 px', await axeViolations(page))
    add('44 px targets', await smallTargets(page, 44))
    await emulate(page, { reducedMotion: 'reduce' })
    add('reduced motion', await motionUnderReduce(page))
  } finally {
    await setTextSize(page, 100)
    await page.emulateMedia({ colorScheme: null, reducedMotion: null })
    await page.setViewportSize(viewport)
  }
  return found
}

/**
 * The sweep as an assertion: every spec's screen states pass it (TSK-0104). With A11Y_REPORT set to a file path, the
 * findings are appended there instead of failing, so one run can list everything still to fix.
 */
export async function expectAccessible(page: Page, label?: string): Promise<void> {
  const found = await sweep(page, label)
  const report = process.env['A11Y_REPORT']
  if (report) {
    if (found.length > 0) appendFileSync(report, `${found.join('\n')}\n`)
    return
  }
  expect(found).toEqual([])
}

/**
 * Keyboard only (WCAG 2.1.1, 2.4.3, 2.4.7, 2.4.11): presses Tab (or Shift+Tab) from where focus is until `target` has
 * focus, failing after `max` presses, then checks the focus is visible (an outline or a box shadow drawn by
 * :focus-visible) and not covered by other content. Returns the number of presses.
 */
export async function tabTo(page: Page, target: Locator, { max = 80, back = false } = {}): Promise<number> {
  await expect(target).toHaveCount(1)
  for (let n = 1; n <= max; n++) {
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab')
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) {
      const ring = await target.evaluate((el) => {
        const s = getComputedStyle(el)
        return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'
      })
      expect(ring, 'the focused control shows a focus indicator').toBe(true)
      // Not obscured (WCAG 2.4.11): what is drawn at the control's centre is the control (or its own label).
      const seen = await target.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return (
          hit !== null &&
          (hit === el ||
            el.contains(hit) ||
            hit.contains(el) ||
            (hit instanceof HTMLLabelElement && hit.control === el) ||
            hit.closest('label')?.control === el)
        )
      })
      expect(seen, 'the focused control is not covered by other content').toBe(true)
      return n
    }
  }
  throw new Error(`not reached with ${max} presses of ${back ? 'Shift+Tab' : 'Tab'}`)
}
