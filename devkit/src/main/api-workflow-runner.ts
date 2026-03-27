import type Database from 'better-sqlite3'
import {
  getApiWorkflowGlobalParams,
  getApiWorkflowParamLayerOrder
} from './app-settings'
import type {
  ApiHttpHostEnv,
  ApiWorkflow,
  ApiWorkflowRunContext,
  ApiWorkflowRunOptions,
  ApiWorkflowRunResult,
  ApiWorkflowRunStepResult,
  ApiWorkflowStep,
  ApiWorkflowTryStepInput,
  ApiWorkflowTryStepResult,
  ApiWorkflowParamLayer,
  SessionBundle
} from '../shared/types/api-workflow'
import { applyHttpHostEnv } from './api-workflow/http-host-env'
import { mergeParamLayers, pickValidHeaderParams } from './api-workflow/param-merge'
import { applyTemplate, getByDotPath, stringifyTemplateValue } from './api-workflow/template-vars'
import { buildCookieHeader, mergeHeaderRules } from './api-workflow/session-bundle'

function parseDefaultParamsJson(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {}
  try {
    const o = JSON.parse(raw) as unknown
    if (o === null || typeof o !== 'object' || Array.isArray(o)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
      else if (v != null) out[k] = String(v)
    }
    return out
  } catch {
    return {}
  }
}

function rowToStep(row: Record<string, unknown>): ApiWorkflowStep {
  const paramsCol = row.params_json != null ? String(row.params_json) : '{}'
  return {
    id: String(row.id),
    workflowId: String(row.workflow_id),
    sortOrder: Number(row.sort_order),
    name: String(row.name),
    method: row.method as ApiWorkflowStep['method'],
    url: String(row.url),
    headers: JSON.parse(String(row.headers_json || '{}')) as Record<string, string>,
    body: String(row.body ?? ''),
    extract: JSON.parse(String(row.extract_json || '{}')) as Record<string, string>,
    defaultParams: parseDefaultParamsJson(paramsCol)
  }
}

function loadWorkflow(db: Database.Database, workflowId: string): ApiWorkflow | null {
  const w = db.prepare('SELECT * FROM api_workflows WHERE id = ?').get(workflowId) as
    | Record<string, unknown>
    | undefined
  if (!w) return null
  const stepRows = db
    .prepare('SELECT * FROM api_workflow_steps WHERE workflow_id = ? ORDER BY sort_order ASC')
    .all(workflowId) as Record<string, unknown>[]
  return {
    id: String(w.id),
    name: String(w.name),
    description: String(w.description ?? ''),
    environmentId: w.environment_id != null ? String(w.environment_id) : null,
    createdAt: String(w.created_at),
    updatedAt: String(w.updated_at),
    steps: stepRows.map(rowToStep)
  }
}

function loadLatestBundle(db: Database.Database): SessionBundle | null {
  const row = db
    .prepare('SELECT bundle_json FROM api_environments ORDER BY updated_at DESC LIMIT 1')
    .get() as { bundle_json: string } | undefined
  if (!row?.bundle_json) return null
  try {
    return JSON.parse(row.bundle_json) as SessionBundle
  } catch {
    return null
  }
}

const MAX_BODY_PREVIEW = 4000
/** 单步调试界面展示用，避免超大响应拖垮渲染 */
const MAX_TRY_RESPONSE_CHARS = 1_500_000
const STEP_TIMEOUT_MS = 120_000

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

/** 已解析模板、环境、Cookie 后的单次请求 */
type PreparedStepRequest = {
  url: string
  method: ApiWorkflowStep['method']
  headerObj: Record<string, string>
  bodyRaw: string | undefined
}

function shSingleQuote(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

/** 与 Node/fetch 实际发送一致的 cURL（bash 风格，便于复制到终端） */
export function buildCurlFromPrepared(prep: PreparedStepRequest): string {
  const parts: string[] = ['curl', '-sS', '-X', prep.method, shSingleQuote(prep.url)]
  const keys = Object.keys(prep.headerObj).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  )
  for (const k of keys) {
    const v = prep.headerObj[k] ?? ''
    parts.push('-H', shSingleQuote(`${k}: ${v}`))
  }
  if (
    prep.bodyRaw !== undefined &&
    prep.method !== 'GET' &&
    prep.method !== 'HEAD'
  ) {
    parts.push('--data-raw', shSingleQuote(prep.bodyRaw))
  }
  return parts.join(' ')
}

type PrepareCtx = {
  step: ApiWorkflowStep
  ctx: ApiWorkflowRunContext
  envFlat: Record<string, string>
  bundle: SessionBundle | null
  httpHostEnv: ApiHttpHostEnv
  pushParams: Record<string, string>
  globalParams: Record<string, string>
  layerOrder: ApiWorkflowParamLayer[]
  log: (s: string) => void
}

/** 扩展/步骤里可能带生产域名的 Host；必须与最终请求 URL 一致，否则网关路由错误 */
function enforceHostHeaderMatchesUrl(headers: Record<string, string>, requestUrl: string): void {
  let pu: URL
  try {
    pu = new URL(requestUrl)
  } catch {
    return
  }
  const hostValue = pu.host
  if (!hostValue) return
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === 'host') delete headers[key]
  }
  headers.Host = hostValue
}

function prepareStepRequest(d: PrepareCtx): { ok: true; prep: PreparedStepRequest } | { ok: false; error: string } {
  try {
    const paramMerged = mergeParamLayers(d.layerOrder, {
      push: d.pushParams,
      global: d.globalParams,
      step: d.step.defaultParams
    })
    const templateRoot = { ...d.ctx, env: d.envFlat, param: paramMerged }

    /** 模板解析后的基准 URL（与库中存储、扩展导出 Cookie 的域一致） */
    const urlAfterTemplate = applyTemplate(d.step.url, templateRoot)
    if (!/^https?:\/\//i.test(urlAfterTemplate)) {
      return { ok: false, error: 'URL 须为绝对地址（http/https）' }
    }
    /** 实际请求的 URL（test/dev 会改最左域标签） */
    const url = applyHttpHostEnv(urlAfterTemplate, d.httpHostEnv)

    const headerObj: Record<string, string> = { ...d.step.headers }
    for (const [k, v] of Object.entries(headerObj)) {
      headerObj[k] = applyTemplate(v, templateRoot)
    }

    const { headers: autoHeaders, skippedKeys } = pickValidHeaderParams(paramMerged)
    if (skippedKeys.length > 0) {
      d.log(
        `  跳过非法 Header 名（${skippedKeys.length} 个）: ${skippedKeys.slice(0, 8).join(', ')}${skippedKeys.length > 8 ? '…' : ''}`
      )
    }
    Object.assign(headerObj, autoHeaders)

    if (d.bundle) {
      // 仅按域名匹配；优先实际请求主机上的 Cookie，再补基准主机（与生产/测试主机名不一致时）
      const cookie = buildCookieHeader(d.bundle.cookies, url, urlAfterTemplate)
      if (cookie) {
        const existing = headerObj['Cookie'] ?? headerObj['cookie']
        headerObj['Cookie'] = existing ? `${existing}; ${cookie}` : cookie
      } else if (d.bundle.cookies.length > 0) {
        d.log(
          '  提示: 环境包内有 Cookie，但与当前请求主机（及基准主机）的域名/secure 均不匹配，未附加 Cookie'
        )
      }
      // 与 Cookie 相同：按基准 URL 匹配扩展导出规则，避免 test-/dev- 改主机名后规则不命中
      Object.assign(headerObj, mergeHeaderRules(d.bundle.headerRules, urlAfterTemplate))
    }

    const bodyRaw = d.step.body.trim()
      ? applyTemplate(d.step.body, templateRoot)
      : undefined

    enforceHostHeaderMatchesUrl(headerObj, url)

    return {
      ok: true,
      prep: { url, method: d.step.method, headerObj, bodyRaw }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

function loadRunnerDeps(db: Database.Database, httpHostEnv: ApiHttpHostEnv) {
  const globalParams = getApiWorkflowGlobalParams(db)
  const layerOrder = getApiWorkflowParamLayerOrder(db)
  const bundle = loadLatestBundle(db)
  const envFlat: Record<string, string> = {}
  if (bundle) {
    envFlat.Cookie = ''
  }
  const pushParams =
    bundle?.pushParams && typeof bundle.pushParams === 'object' ? bundle.pushParams : {}
  return { globalParams, layerOrder, bundle, envFlat, pushParams, httpHostEnv }
}

function tryInputToStep(input: ApiWorkflowTryStepInput, stepId: string): ApiWorkflowStep {
  return {
    id: stepId,
    workflowId: '',
    sortOrder: 0,
    name: input.name,
    method: input.method,
    url: input.url,
    headers: input.headers ?? {},
    body: input.body ?? '',
    extract: input.extract ?? {},
    defaultParams: input.defaultParams ?? {}
  }
}

/** 仅生成与真实请求一致的 cURL，不发起网络请求 */
export function buildTryStepCurl(
  db: Database.Database,
  input: ApiWorkflowTryStepInput,
  options?: ApiWorkflowRunOptions
): { curl: string } | { error: string } {
  const httpHostEnv = options?.httpHostEnv ?? 'prod'
  const { globalParams, layerOrder, bundle, envFlat, pushParams } = loadRunnerDeps(db, httpHostEnv)
  const ctx: ApiWorkflowRunContext = { vars: {}, idx: {}, steps: {} }
  const step = tryInputToStep(input, 'try-curl')
  const prepR = prepareStepRequest({
    step,
    ctx,
    envFlat,
    bundle,
    httpHostEnv,
    pushParams,
    globalParams,
    layerOrder,
    log: () => {
      /* no-op */
    }
  })
  if (!prepR.ok) return { error: prepR.error }
  return { curl: buildCurlFromPrepared(prepR.prep) }
}

/** 编辑页单步调试：合并参数、模板、Cookie 后与完整工作流单步逻辑一致 */
export async function runApiWorkflowTryStep(
  db: Database.Database,
  input: ApiWorkflowTryStepInput,
  options?: ApiWorkflowRunOptions
): Promise<ApiWorkflowTryStepResult> {
  const httpHostEnv = options?.httpHostEnv ?? 'prod'
  const { globalParams, layerOrder, bundle, envFlat, pushParams } = loadRunnerDeps(db, httpHostEnv)
  const lines: string[] = []
  const log = (s: string) => {
    lines.push(s)
  }

  const ctx: ApiWorkflowRunContext = { vars: {}, idx: {}, steps: {} }
  const stepId = 'try-step'
  const step = tryInputToStep(input, stepId)

  log(`\n── 调试步骤: ${step.name} (${step.method} ${step.url}) ──`)
  if (!bundle) {
    log('  提示: 未找到已导入的环境包，请求不会自动附加会话 Cookie（请「从 JSON 导入」或由扩展推送）')
  }

  const stepRes: ApiWorkflowRunStepResult = {
    stepId,
    name: step.name,
    ok: false
  }

  const prepR = prepareStepRequest({
    step,
    ctx,
    envFlat,
    bundle,
    httpHostEnv,
    pushParams,
    globalParams,
    layerOrder,
    log
  })

  if (!prepR.ok) {
    stepRes.error = prepR.error
    log(`  错误: ${prepR.error}`)
    return {
      ok: false,
      log: lines.join('\n'),
      steps: [stepRes],
      curl: '',
      responseBody: undefined,
      responseTruncated: false,
      debugDurationMs: undefined,
      debugResponseBytes: undefined
    }
  }

  const curl = buildCurlFromPrepared(prepR.prep)

  try {
    const { prep } = prepR
    const init: RequestInit = {
      method: prep.method,
      headers: prep.headerObj,
      redirect: 'follow'
    }
    if (prep.bodyRaw !== undefined && prep.method !== 'GET' && prep.method !== 'HEAD') {
      init.body = prep.bodyRaw
    }

    const t0 = Date.now()
    const res = await fetchWithTimeout(prep.url, init, STEP_TIMEOUT_MS)
    stepRes.status = res.status
    const text = await res.text()
    const debugDurationMs = Date.now() - t0
    const debugResponseBytes = new TextEncoder().encode(text).length
    let responseBody = text
    let responseTruncated = false
    if (text.length > MAX_TRY_RESPONSE_CHARS) {
      responseBody = text.slice(0, MAX_TRY_RESPONSE_CHARS) + '\n…(已截断)'
      responseTruncated = true
    }

    let jsonBody: unknown = text
    try {
      jsonBody = text ? JSON.parse(text) : null
    } catch {
      jsonBody = text
    }

    const preview =
      typeof text === 'string' && text.length > MAX_BODY_PREVIEW
        ? text.slice(-MAX_BODY_PREVIEW) + '\n…(已截断)'
        : text
    stepRes.bodyPreview = preview

    const slot = {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: jsonBody
    }
    ctx.steps[stepId] = slot
    ctx.idx['0'] = slot

    for (const [varName, jsonPath] of Object.entries(step.extract)) {
      const v = getByDotPath(jsonBody, jsonPath)
      ctx.vars[varName] = stringifyTemplateValue(v)
      log(
        `  extract ${varName} = ${ctx.vars[varName].slice(0, 200)}${ctx.vars[varName].length > 200 ? '…' : ''}`
      )
    }

    const debugMeta = {
      curl,
      responseBody,
      responseTruncated,
      debugDurationMs,
      debugResponseBytes
    }

    if (!res.ok) {
      stepRes.ok = false
      stepRes.error = `HTTP ${res.status}`
      log(`  失败: HTTP ${res.status}`)
      return { ok: false, log: lines.join('\n'), steps: [stepRes], ...debugMeta }
    }

    stepRes.ok = true
    log(`  成功: HTTP ${res.status}`)
    return { ok: true, log: lines.join('\n'), steps: [stepRes], ...debugMeta }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    stepRes.error = msg
    log(`  错误: ${msg}`)
    return {
      ok: false,
      log: lines.join('\n'),
      steps: [stepRes],
      curl,
      responseBody: undefined,
      responseTruncated: false,
      debugDurationMs: undefined,
      debugResponseBytes: undefined
    }
  }
}

export async function runApiWorkflow(
  db: Database.Database,
  workflowId: string,
  options?: ApiWorkflowRunOptions
): Promise<ApiWorkflowRunResult> {
  const wf = loadWorkflow(db, workflowId)
  if (!wf || !wf.steps?.length) {
    return { ok: false, log: '工作流不存在或没有步骤', steps: [] }
  }

  const httpHostEnv = options?.httpHostEnv ?? 'prod'
  const { globalParams, layerOrder, bundle, envFlat, pushParams } = loadRunnerDeps(db, httpHostEnv)

  const lines: string[] = []
  const stepResults: ApiWorkflowRunStepResult[] = []

  const ctx: ApiWorkflowRunContext = { vars: {}, idx: {}, steps: {} }

  const log = (s: string) => {
    lines.push(s)
  }

  for (let si = 0; si < wf.steps.length; si++) {
    const step = wf.steps[si]!
    log(`\n── 步骤: ${step.name} (${step.method} ${step.url}) ──`)
    const stepRes: ApiWorkflowRunStepResult = {
      stepId: step.id,
      name: step.name,
      ok: false
    }
    try {
      const prepR = prepareStepRequest({
        step,
        ctx,
        envFlat,
        bundle,
        httpHostEnv,
        pushParams,
        globalParams,
        layerOrder,
        log
      })
      if (!prepR.ok) {
        stepRes.error = prepR.error
        log(`  错误: ${prepR.error}`)
        stepResults.push(stepRes)
        return { ok: false, log: lines.join('\n'), steps: stepResults }
      }

      const { prep } = prepR
      const init: RequestInit = {
        method: prep.method,
        headers: prep.headerObj,
        redirect: 'follow'
      }
      if (prep.bodyRaw !== undefined && prep.method !== 'GET' && prep.method !== 'HEAD') {
        init.body = prep.bodyRaw
      }

      const res = await fetchWithTimeout(prep.url, init, STEP_TIMEOUT_MS)
      stepRes.status = res.status
      const text = await res.text()
      let jsonBody: unknown = text
      try {
        jsonBody = text ? JSON.parse(text) : null
      } catch {
        jsonBody = text
      }

      const preview =
        typeof text === 'string' && text.length > MAX_BODY_PREVIEW
          ? text.slice(-MAX_BODY_PREVIEW) + '\n…(已截断)'
          : text
      stepRes.bodyPreview = preview

      const slot = {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
        body: jsonBody
      }
      ctx.steps[step.id] = slot
      ctx.idx[String(si)] = slot

      for (const [varName, jsonPath] of Object.entries(step.extract)) {
        const v = getByDotPath(jsonBody, jsonPath)
        ctx.vars[varName] = stringifyTemplateValue(v)
        log(`  extract ${varName} = ${ctx.vars[varName].slice(0, 200)}${ctx.vars[varName].length > 200 ? '…' : ''}`)
      }

      if (!res.ok) {
        stepRes.ok = false
        stepRes.error = `HTTP ${res.status}`
        log(`  失败: HTTP ${res.status}`)
        stepResults.push(stepRes)
        return { ok: false, log: lines.join('\n'), steps: stepResults }
      }

      stepRes.ok = true
      log(`  成功: HTTP ${res.status}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      stepRes.error = msg
      log(`  错误: ${msg}`)
      stepResults.push(stepRes)
      return { ok: false, log: lines.join('\n'), steps: stepResults }
    }
    stepResults.push(stepRes)
  }

  log('\n── 全部步骤完成 ──')
  return { ok: true, log: lines.join('\n'), steps: stepResults }
}
