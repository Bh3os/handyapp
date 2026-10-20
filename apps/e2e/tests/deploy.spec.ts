import { expect, test } from '@playwright/test'

test.describe('built server health and noindex (TSK-0003, RULE-SYNTHETIC-DATA)', () => {
  test('[RULE-SYNTHETIC-DATA] /healthz answers, pages carry X-Robots-Tag noindex and robots.txt disallows all', async ({
    request,
  }) => {
    const health = await request.get('/healthz')
    expect(health.status()).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok' })

    const home = await request.get('/')
    expect(home.headers()['x-robots-tag']).toBe('noindex, nofollow')

    const robots = await request.get('/robots.txt')
    expect(await robots.text()).toBe('User-agent: *\nDisallow: /\n')
  })
})
