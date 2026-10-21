// Two origins (TSK-0017; OWN-DEC-133, HH-ARC-06, HH-ARC-07, HH-SEC-02). One server answers the public host
// (handyhub247.com: the site, /portal, the public and customer APIs and the provider webhooks) and the staff host
// (staff.handyhub247.com: the staff app and the staff API). Host names come from PUBLIC_ORIGIN and STAFF_ORIGIN;
// with both unset (local, ci, the single Render URL) one host serves every surface, with the staff app under /staff.
// - Every API surface answers 404 on the other host; an unknown host gets 404 everywhere except the health checks.
// - Cookies are host-only (no Domain attribute) and each surface reads only its own session (register.ts), so a
//   staff session never acts on the public host and a customer session never on the staff host.
// - No CORS: the frontends call their own origin only, so no Access-Control-* header is ever sent (HH-ARC-07 does not
//   apply; docs/architecture.md).
// - Security headers on every response; inline scripts and styles of the built site are allowed by their hashes only.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Config, HostConfig } from './config.js'

export type HostSide = 'public' | 'staff' | 'any' | 'unknown'
export type Surface = 'public' | 'customer' | 'staff'

declare module 'fastify' {
  interface FastifyRequest {
    /** Which host this request reached (TSK-0017). */
    hostSide?: HostSide
  }
}

/** The side a Host header names: in single mode every host is 'any'. */
export function hostSide(hosts: HostConfig, hostHeader: string | undefined): HostSide {
  if (hosts.mode === 'single') return 'any'
  const host = (hostHeader ?? '').trim().toLowerCase()
  if (host === hosts.publicHost) return 'public'
  if (host === hosts.staffHost) return 'staff'
  return 'unknown'
}

export const SURFACES: readonly Surface[] = ['public', 'customer', 'staff']

/** The surface a path below /api/v1 belongs to (its first segment), or null. */
export function surfaceOf(path: string): Surface | null {
  const first = /^\/([a-z]+)(?:[/?]|$)/.exec(path)?.[1]
  return SURFACES.find((s) => s === first) ?? null
}

/** Whether an API surface may answer on a host side. */
export function surfaceAllowed(surface: Surface, side: HostSide): boolean {
  if (side === 'any') return true
  if (side === 'unknown') return false
  return surface === 'staff' ? side === 'staff' : side === 'public'
}

/** Paths that answer on every host: the health checks Render polls and robots.txt (the sitemap checks its host). */
export const ANY_HOST_PATHS = new Set(['/healthz', '/readyz', '/robots.txt'])

/**
 * Private surfaces: no referrer leaves them, and they are never indexed or listed in the sitemap (HH-CUS-05). The
 * request form holds the visitor's unfinished draft (TSK-0023: request drafts are private).
 */
export function isPrivatePath(side: HostSide, url: string): boolean {
  if (side === 'staff') return true
  return /^\/(staff|portal|api|access|project|account|request)(\/|$)/.test(url)
}

const inlineTag = /<(script|style)(\s[^>]*)?>([\s\S]*?)<\/\1>/g

/** SHA-256 hashes of the inline scripts and styles in the built HTML of a directory (CSP allow-list). */
export function inlineHashes(dir: string | undefined): { scripts: string[]; styles: string[] } {
  const scripts = new Set<string>()
  const styles = new Set<string>()
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name)
      if (name.startsWith('.')) continue
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.html'))
        for (const m of readFileSync(p, 'utf8').matchAll(inlineTag)) {
          const [, tag, attrs = '', body = ''] = m
          if (tag === 'script' && /\ssrc=/.test(attrs)) continue
          if (body.trim() === '') continue
          const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`
          ;(tag === 'script' ? scripts : styles).add(hash)
        }
    }
  }
  if (dir && existsSync(dir)) walk(dir)
  return { scripts: [...scripts].sort(), styles: [...styles].sort() }
}

/** The Content-Security-Policy: same origin only, inline code only by hash, no framing. */
export function contentSecurityPolicy(hashes: { scripts: string[]; styles: string[] }): string {
  return [
    "default-src 'self'",
    `script-src 'self'${hashes.scripts.map((h) => ` ${h}`).join('')}`,
    `style-src 'self'${hashes.styles.map((h) => ` ${h}`).join('')}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** PROPOSED: one year of HSTS in staging and production, without includeSubDomains or preload (owner's DNS). */
export const HSTS = 'max-age=31536000'

export function securityHeaders(config: Config, csp: string) {
  const https = config.env === 'staging' || config.env === 'production'
  return (req: FastifyRequest, reply: FastifyReply): void => {
    const side = req.hostSide ?? 'any'
    const url = req.url.split('?')[0] ?? '/'
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('content-security-policy', csp)
    reply.header('cross-origin-opener-policy', 'same-origin')
    reply.header('referrer-policy', isPrivatePath(side, url) ? 'no-referrer' : 'strict-origin-when-cross-origin')
    if (https) reply.header('strict-transport-security', HSTS)
    // Staging is noindex everywhere; the staff host and private routes are noindex in every environment.
    if (config.noindex || isPrivatePath(side, url)) reply.header('x-robots-tag', 'noindex, nofollow')
  }
}

/** A file inside `root` named by a URL path, or null (never outside the root). */
export function fileIn(root: string, urlPath: string): string | null {
  let rel: string
  try {
    rel = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const full = path.resolve(root, `.${path.posix.normalize(`/${rel}`)}`)
  if (full !== root && !full.startsWith(root + path.sep)) return null
  return existsSync(full) && statSync(full).isFile() ? full : null
}
