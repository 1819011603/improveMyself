import type { ApiWorkflowParamLayer } from '../../shared/types/api-workflow'

const LAYERS: ApiWorkflowParamLayer[] = ['push', 'global', 'step']

/** RFC 9110 token（简化：常见 header 名字符集） */
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~A-Za-z0-9-]+$/

export function isValidHttpHeaderName(name: string): boolean {
  if (!name || name.length > 256) return false
  return HEADER_NAME_RE.test(name)
}

export function normalizeParamLayerOrder(raw: unknown): ApiWorkflowParamLayer[] {
  if (!Array.isArray(raw) || raw.length !== LAYERS.length) {
    return ['step', 'global', 'push']
  }
  const set = new Set<string>(LAYERS)
  const out: ApiWorkflowParamLayer[] = []
  for (const x of raw) {
    if (typeof x !== 'string' || !set.has(x as ApiWorkflowParamLayer)) {
      return ['step', 'global', 'push']
    }
    out.push(x as ApiWorkflowParamLayer)
    set.delete(x)
  }
  if (set.size !== 0) return ['step', 'global', 'push']
  return out
}

export function mergeParamLayers(
  order: ApiWorkflowParamLayer[],
  layers: {
    push: Record<string, string>
    global: Record<string, string>
    step: Record<string, string>
  }
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const layer of order) {
    const src = layers[layer]
    if (src && typeof src === 'object') {
      for (const [k, v] of Object.entries(src)) {
        if (typeof v === 'string') out[k] = v
      }
    }
  }
  return out
}

/** 仅保留合法 header 名的键，用于写入请求头 */
export function pickValidHeaderParams(merged: Record<string, string>): {
  headers: Record<string, string>
  skippedKeys: string[]
} {
  const headers: Record<string, string> = {}
  const skippedKeys: string[] = []
  for (const [k, v] of Object.entries(merged)) {
    if (isValidHttpHeaderName(k)) headers[k] = v
    else skippedKeys.push(k)
  }
  return { headers, skippedKeys }
}
