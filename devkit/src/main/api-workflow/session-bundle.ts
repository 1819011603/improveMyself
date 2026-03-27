import type { SessionBundle, SessionBundleCookie, SessionBundleHeaderRule } from '../../shared/types/api-workflow'
import { SESSION_BUNDLE_VERSION } from '../../shared/types/api-workflow'

function domainMatches(cookieDomain: string, hostname: string): boolean {
  const d = cookieDomain.startsWith('.') ? cookieDomain.slice(1) : cookieDomain
  return hostname === d || hostname.endsWith('.' + d)
}

/**
 * 组装 Cookie 请求头。
 * - **仅按域名匹配**，忽略导出里的 Path（与「同一站点任意路径共用 Cookie」一致）。
 * - `credentialUrl`：实际请求的完整 URL，用于 Secure 判断及**优先**匹配的主机名（test/dev 改写后的主机）。
 * - `alternateBaseUrl`：模板解析后、环境改写前的基准 URL；当与前者主机名不同时，再补上**仅**能匹配基准主机、且与优先轮不重名的项（生产/开发 Cookie 不一致时常用）。
 */
export function buildCookieHeader(
  cookies: SessionBundleCookie[],
  credentialUrl: string,
  alternateBaseUrl?: string
): string {
  let cred: URL
  try {
    cred = new URL(credentialUrl)
  } catch {
    return ''
  }
  const https = cred.protocol === 'https:'
  const preferredHost = cred.hostname

  let baseHost: string | null = null
  if (alternateBaseUrl?.trim()) {
    try {
      const h = new URL(alternateBaseUrl).hostname
      if (h && h !== preferredHost) baseHost = h
    } catch {
      /* ignore */
    }
  }

  const byName = new Map<string, string>()

  for (const c of cookies) {
    if (c.secure && !https) continue
    if (!domainMatches(c.domain, preferredHost)) continue
    if (!byName.has(c.name)) byName.set(c.name, c.value)
  }

  if (baseHost) {
    for (const c of cookies) {
      if (c.secure && !https) continue
      if (byName.has(c.name)) continue
      if (!domainMatches(c.domain, baseHost)) continue
      byName.set(c.name, c.value)
    }
  }

  return [...byName.entries()].map(([n, v]) => `${n}=${v}`).join('; ')
}

export function mergeHeaderRules(
  rules: SessionBundleHeaderRule[],
  requestUrl: string
): Record<string, string> {
  let u: URL
  try {
    u = new URL(requestUrl)
  } catch {
    return {}
  }
  const host = u.hostname
  const path = u.pathname || '/'
  const out: Record<string, string> = {}
  for (const r of rules) {
    const suf = r.match.hostSuffix.replace(/^\./, '')
    if (!host.endsWith(suf) && host !== suf) continue
    if (r.match.pathPrefix) {
      const pre = r.match.pathPrefix.startsWith('/') ? r.match.pathPrefix : '/' + r.match.pathPrefix
      if (!path.startsWith(pre)) continue
    }
    Object.assign(out, r.headers)
  }
  return out
}

export function parseSessionBundleJson(raw: string): SessionBundle {
  let data: unknown
  try {
    data = JSON.parse(raw) as unknown
  } catch {
    throw new Error('环境包 JSON 无法解析')
  }
  if (data === null || typeof data !== 'object') throw new Error('环境包格式无效')
  const o = data as Record<string, unknown>
  if (o.version !== SESSION_BUNDLE_VERSION) {
    throw new Error(`环境包 version 须为 ${SESSION_BUNDLE_VERSION}`)
  }
  if (typeof o.exportedAt !== 'string') throw new Error('环境包缺少 exportedAt')
  if (!Array.isArray(o.cookies)) throw new Error('环境包缺少 cookies 数组')
  if (!Array.isArray(o.headerRules)) throw new Error('环境包缺少 headerRules 数组')
  for (const c of o.cookies) {
    if (typeof c !== 'object' || c === null) throw new Error('cookies 项无效')
    const ck = c as Record<string, unknown>
    if (typeof ck.name !== 'string' || typeof ck.value !== 'string') throw new Error('cookie 缺少 name/value')
    if (typeof ck.domain !== 'string') throw new Error('cookie 缺少 domain')
  }
  if (o.configuredDomains !== undefined) {
    if (!Array.isArray(o.configuredDomains)) throw new Error('configuredDomains 须为字符串数组')
    for (const d of o.configuredDomains) {
      if (typeof d !== 'string') throw new Error('configuredDomains 项须为字符串')
    }
  }
  if (o.pushParams !== undefined) {
    if (o.pushParams === null || typeof o.pushParams !== 'object' || Array.isArray(o.pushParams)) {
      throw new Error('pushParams 须为对象')
    }
    for (const [k, v] of Object.entries(o.pushParams as Record<string, unknown>)) {
      if (typeof v !== 'string') throw new Error(`pushParams.${k} 须为字符串`)
    }
  }
  return data as SessionBundle
}
