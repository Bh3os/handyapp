import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/** WCAG 2.0, 2.1 and 2.2 level A and AA rules (axe-core tags). */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']

test.describe('built server serves the public site (TSK-0002, HH-AUD-03)', () => {
  test('home page loads, is hidden from search engines outside production and has no WCAG A/AA violation', async ({
    page,
  }) => {
    const res = await page.goto('/')
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('HandyHub')
    // TSK-0023: the public page itself is indexable; the server keeps every non-production environment out of search.
    expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow')
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
    const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })
})
