/**
 * 将常见「复制为 cURL」文本解析为 HTTP 方法、URL、请求头与 Body。
 * 支持反斜杠续行、单引号 / 双引号参数、-H / -d / --data-raw 等。
 */

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const
export type ParsedCurlMethod = (typeof HTTP_METHODS)[number]

export interface ParsedCurl {
  method: ParsedCurlMethod
  url: string
  headers: Record<string, string>
  body: string
}

function stripLineContinuations(s: string): string {
  return s.replace(/\\\r?\n[ \t]*/g, ' ')
}

/** 从 i 起读取下一个 shell 风格参数（支持 ' ' " "） */
function nextToken(s: string, i: number): { token: string; next: number } | null {
  while (i < s.length && /\s/.test(s[i]!)) i++
  if (i >= s.length) return null
  const c = s[i]!
  if (c === "'") {
    let j = i + 1
    let out = ''
    while (j < s.length && s[j] !== "'") {
      out += s[j]!
      j++
    }
    return { token: out, next: j < s.length ? j + 1 : j }
  }
  if (c === '"') {
    let j = i + 1
    let out = ''
    while (j < s.length) {
      if (s[j] === '\\' && j + 1 < s.length) {
        out += s[j + 1]!
        j += 2
        continue
      }
      if (s[j] === '"') break
      out += s[j]!
      j++
    }
    return { token: out, next: j < s.length ? j + 1 : j }
  }
  let j = i
  while (j < s.length && !/\s/.test(s[j]!)) j++
  return { token: s.slice(i, j), next: j }
}

function tokenizeArgs(s: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < s.length) {
    const r = nextToken(s, i)
    if (!r) break
    out.push(r.token)
    i = r.next
  }
  return out
}

function isHttpUrl(t: string): boolean {
  return /^https?:\/\//i.test(t)
}

function normalizeMethod(m: string): ParsedCurlMethod | null {
  const u = m.toUpperCase()
  return (HTTP_METHODS as readonly string[]).includes(u) ? (u as ParsedCurlMethod) : null
}

/**
 * 若剪贴板内容以 curl 开头则尝试解析；失败返回 null（非 cURL 或无法识别 URL）。
 */
export function tryParseCurl(input: string): ParsedCurl | null {
  const raw = stripLineContinuations(input.trim())
  if (!/^\s*curl\b/i.test(raw)) return null

  let after = raw.replace(/^\s*curl\b/i, '').trim()
  const tokens = tokenizeArgs(after)

  let method: ParsedCurlMethod = 'GET'
  let url = ''
  const headers: Record<string, string> = {}
  let body = ''

  for (let k = 0; k < tokens.length; k++) {
    const a = tokens[k]!

    if (a === '-X' || a === '--request') {
      const nm = normalizeMethod(tokens[k + 1] ?? '')
      if (nm) {
        method = nm
        k++
      }
      continue
    }

    if (a === '-H' || a === '--header') {
      const h = tokens[k + 1]
      if (h) {
        const idx = h.indexOf(':')
        if (idx > 0) {
          const name = h.slice(0, idx).trim()
          const val = h.slice(idx + 1).trim()
          if (name) headers[name] = val
        }
        k++
      }
      continue
    }

    if (a === '-d' || a === '--data' || a === '--data-raw' || a === '--data-binary') {
      const d = tokens[k + 1] ?? ''
      body = body ? body + d : d
      k++
      continue
    }

    if (a === '--data-urlencode') {
      const p = tokens[k + 1] ?? ''
      body = body ? `${body}&${p}` : p
      k++
      continue
    }

    if (a === '--url') {
      const u = tokens[k + 1]
      if (u && isHttpUrl(u)) {
        url = u
        k++
      }
      continue
    }

    if (a.startsWith('-')) continue

    if (isHttpUrl(a)) {
      url = a
      continue
    }
  }

  if (!url) return null

  if (body && method === 'GET') {
    method = 'POST'
  }

  return { method, url, headers, body }
}
