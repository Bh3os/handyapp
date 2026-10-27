#!/usr/bin/env node
/* global window -- the observer and the read-back run in the page, not in Node */
// Lab page measurements (TSK-0105; HH-NFR-01: "lab proxy first ... lab is never reported as field"). Loads public and
// customer pages of a running built server in Chromium with a cold cache, under the throttling Lighthouse uses for its
// mobile and desktop runs, and records Largest Contentful Paint, Cumulative Layout Shift, First Contentful Paint, Total
// Blocking Time (long tasks after the first paint, a Lighthouse-like approximation) and the bytes transferred. INP
// needs real interactions and stays a field metric: it is not measured here. Results are lab results on the machine
// that ran them; docs/perf/README.md says how to run it and where the results go.
//
// Usage (from apps/e2e, after pnpm build and with the server running, see docs/perf/README.md):
//   node lab/page-vitals.mjs http://127.0.0.1:4610 ../../docs/perf/results/<date>-lab-pages.json
// E2E_CHROMIUM_EXECUTABLE points at a local Chromium, as for the e2e suite.
import { writeFileSync } from 'node:fs'
import os from 'node:os'
import { chromium } from '@playwright/test'

/** PROPOSED (OQ-PERF-BUDGET-DETAILS): the pages; the service page is one of the published services. */
export const PAGES = ['/', '/services', '/services/interior-painting', '/request', '/areas', '/account', '/portal/']

/** Lighthouse's default throttling (simulated values applied for real here through the DevTools protocol). */
export const PROFILES = {
  mobile: {
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
    cpu: 4,
    network: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  },
  desktop: {
    viewport: { width: 1350, height: 940 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    cpu: 1,
    network: { latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (10 * 1024 * 1024) / 8 },
  },
}

const OBSERVE = () => {
  const m = { lcp: null, cls: 0, fcp: null, longTasks: [] }
  window.__vitals = m
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) m.lcp = e.startTime
  }).observe({ type: 'largest-contentful-paint', buffered: true })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) m.cls += e.value
  }).observe({ type: 'layout-shift', buffered: true })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime
  }).observe({ type: 'paint', buffered: true })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) m.longTasks.push({ start: e.startTime, duration: e.duration })
  }).observe({ type: 'longtask', buffered: true })
}

async function measure(browser, base, path, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
  })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile.network })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu })
  let bytes = 0
  let requests = 0
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength
    requests++
  })
  await page.addInitScript(OBSERVE)
  const response = await page.goto(`${base}${path}`, { waitUntil: 'load', timeout: 120_000 })
  await page.waitForTimeout(3_000)
  const v = await page.evaluate(() => window.__vitals)
  await context.close()
  const tbt = v.longTasks
    .filter((t) => v.fcp === null || t.start + t.duration > v.fcp)
    .reduce((n, t) => n + Math.max(0, t.duration - 50), 0)
  return { status: response?.status() ?? null, lcp: v.lcp, cls: v.cls, fcp: v.fcp, tbt, bytes, requests }
}

const median = (xs) => {
  const s = xs.filter((x) => x !== null).sort((a, b) => a - b)
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null
}

/**
 * Render's load balancers compress every response with Brotli or gzip (render.com/docs/native-runtimes); the server
 * itself does not. LAB_COMPRESS=1 puts a local gzip proxy in front of the server so the lab sees what a visitor
 * downloads on Render (gzip only: a little heavier than Brotli, so the result errs on the slow side).
 */
async function compressingProxy(target) {
  const { createServer, request } = await import('node:http')
  const { createGzip } = await import('node:zlib')
  const upstream = new URL(target)
  const server = createServer((req, res) => {
    const forward = request(
      { host: upstream.hostname, port: upstream.port, path: req.url, method: req.method, headers: req.headers },
      (up) => {
        const type = String(up.headers['content-type'] ?? '')
        const gzip =
          /gzip/.test(String(req.headers['accept-encoding'] ?? '')) &&
          !up.headers['content-encoding'] &&
          /text|javascript|json|xml|svg/.test(type)
        const headers = { ...up.headers }
        if (gzip) {
          delete headers['content-length']
          headers['content-encoding'] = 'gzip'
          headers['vary'] = 'accept-encoding'
        }
        res.writeHead(up.statusCode ?? 502, headers)
        if (gzip) up.pipe(createGzip()).pipe(res)
        else up.pipe(res)
      },
    )
    req.pipe(forward)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}

async function main([target = 'http://127.0.0.1:4610', out, runsArg = '3']) {
  const runs = Number(runsArg)
  const proxy = process.env['LAB_COMPRESS'] === '1' ? await compressingProxy(target) : null
  const base = proxy?.base ?? target
  const browser = await chromium.launch({
    ...(process.env['E2E_CHROMIUM_EXECUTABLE'] ? { executablePath: process.env['E2E_CHROMIUM_EXECUTABLE'] } : {}),
  })
  const results = []
  try {
    for (const [name, profile] of Object.entries(PROFILES))
      for (const path of PAGES) {
        const samples = []
        for (let i = 0; i < runs; i++) samples.push(await measure(browser, base, path, profile))
        const pick = (k) => median(samples.map((s) => s[k]))
        results.push({
          profile: name,
          path,
          status: samples[0]?.status ?? null,
          runs,
          lcpMs: pick('lcp'),
          cls: pick('cls'),
          fcpMs: pick('fcp'),
          tbtMs: pick('tbt'),
          transferBytes: pick('bytes'),
          requests: pick('requests'),
        })
        process.stdout.write(`${name} ${path} ${JSON.stringify(results.at(-1))}\n`)
      }
  } finally {
    await browser.close()
    proxy?.close()
  }
  const result = {
    kind: 'lab',
    task: 'TSK-0105',
    measuredAt: new Date().toISOString(),
    tool: 'Playwright Chromium with DevTools-protocol throttling (Lighthouse default mobile and desktop values)',
    compression: proxy ? 'gzip proxy (as the Render load balancer compresses)' : 'none (the server alone)',
    note: process.env['PERF_NOTE'] ?? null,
    machine: { platform: `${os.platform()} ${os.release()}`, cpus: os.cpus().length, loadAverage: os.loadavg() },
    results,
  }
  if (out) writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
}

await main(process.argv.slice(2))
