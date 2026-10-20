import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** WCAG 2.0, 2.1 and 2.2 level A and AA rules (axe-core tags). */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const GALLERY = `http://127.0.0.1:${process.env['E2E_GALLERY_PORT'] ?? 4311}/`

async function openGallery(page: Page, theme: 'light' | 'dark') {
  await page.goto(`${GALLERY}?theme=${theme}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Component gallery' })).toBeVisible()
  // Both self-hosted typefaces are loaded before anything is measured or compared.
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  expect(await page.evaluate(() => document.fonts.check('16px "Source Sans 3"'))).toBe(true)
  expect(await page.evaluate(() => document.fonts.check('32px "Newsreader"'))).toBe(true)
}

test.describe('design system gallery (TSK-0018, HH-BASE-01, T75)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`[HH-BASE-01] ${theme} theme has no WCAG A/AA violation`, async ({ page }) => {
      await openGallery(page, theme)
      const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
      expect(scan.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target).join(', ')})`)).toEqual([])
    })

    test(`[HH-BASE-01][T75] ${theme} theme matches the committed visual baseline`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await openGallery(page, theme)
      await expect(page).toHaveScreenshot(`gallery-${theme}.png`, { fullPage: true })
    })
  }

  test('[HH-BASE-01][T75] phone width: the gallery fits 360 px without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await openGallery(page, 'light')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
    // Dense text at phone width anti-aliases differently in the full Chromium binary than in the headless shell CI
    // uses (about 3% of pixels), so this baseline allows 5%; layout and colour regressions still exceed it.
    await expect(page).toHaveScreenshot('gallery-phone.png', { fullPage: true, maxDiffPixelRatio: 0.05 })
  })

  test('[HH-BASE-01] keyboard: tabs move with arrows, the dialog traps Escape and returns focus', async ({ page }) => {
    await openGallery(page, 'light')
    const overview = page.getByRole('tab', { name: 'Overview' })
    await overview.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Messages' })).toBeFocused()
    await expect(page.getByRole('tabpanel')).toHaveText('Messages panel.')

    const opener = page.getByRole('button', { name: 'Open dialog' })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: 'Discard this draft?' })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveScreenshot('gallery-dialog.png')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  })

  test('[HH-BASE-01] the focus ring is visible on a button', async ({ page }) => {
    await openGallery(page, 'light')
    const button = page.getByRole('button', { name: 'Request an estimate' })
    await button.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(button).toBeFocused()
    const outline = await button.evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(outline).toBe('solid')
  })
})
