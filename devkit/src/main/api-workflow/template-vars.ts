import type { ApiWorkflowRunContext } from '../../shared/types/api-workflow'

/** 点号路径取值，如 a.b.0.c */
export function getByDotPath(root: unknown, path: string): unknown {
  if (!path.trim()) return root
  const parts = path.split('.').filter(Boolean)
  let cur: unknown = root
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function stringifyTemplateValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

type TemplateRoot = ApiWorkflowRunContext & {
  env?: Record<string, string>
  /** 推送/全局/步骤默认合并后的扁平参数，如 {{param.token}} */
  param?: Record<string, string>
}

/** 支持 {{vars.x}}、{{param.x}}、{{steps.stepId.body.data.id}}、{{env.Cookie}} */
export function applyTemplate(template: string, root: TemplateRoot): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = getByDotPath(root, key)
    return stringifyTemplateValue(v)
  })
}
