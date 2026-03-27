import { isIPv4, isIPv6 } from 'net'
import type { ApiHttpHostEnv } from '../../shared/types/api-workflow'

function stripLeadingEnvPrefix(label: string): string {
  return label.replace(/^(test-|dev-)/i, '')
}

function firstLabelWithEnv(first: string, env: ApiHttpHostEnv): string {
  const base = stripLeadingEnvPrefix(first)
  if (env === 'prod') return base
  if (env === 'test') return `test-${base}`
  return `dev-${base}`
}

function shouldSkipHostname(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost') return true
  if (isIPv4(h) || isIPv6(h)) return true
  return false
}

/** prod 为存储的基准 URL；test/dev 改写最左侧域标签（≥3 段时生效） */
export function applyHttpHostEnv(urlStr: string, env: ApiHttpHostEnv): string {
  if (env === 'prod') return urlStr
  let u: URL
  try {
    u = new URL(urlStr)
  } catch {
    return urlStr
  }
  if (!/^https?:$/i.test(u.protocol)) return urlStr
  const hostname = u.hostname
  if (shouldSkipHostname(hostname)) return urlStr
  const parts = hostname.split('.').filter(Boolean)
  if (parts.length < 3) return urlStr
  parts[0] = firstLabelWithEnv(parts[0]!, env)
  u.hostname = parts.join('.')
  return u.toString()
}
