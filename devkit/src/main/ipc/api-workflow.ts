import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { getDb } from '../db'
import { insertApiEnvironment } from '../api-environment-insert'
import { buildTryStepCurl, runApiWorkflow, runApiWorkflowTryStep } from '../api-workflow-runner'
import { parseSessionBundleJson } from '../api-workflow/session-bundle'
import { toIpcReply } from '../../shared/ipc-clone'
import { IPC } from '../../shared/types'
import type {
  ApiEnvironment,
  ApiWorkflow,
  ApiWorkflowStep,
  ApiWorkflowTryStepInput,
  SessionBundle
} from '../../shared/types/api-workflow'

function rowToEnv(row: Record<string, unknown>): ApiEnvironment {
  return {
    id: String(row.id),
    name: String(row.name),
    bundle: JSON.parse(String(row.bundle_json)) as SessionBundle,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function rowToWorkflow(row: Record<string, unknown>, steps: ApiWorkflowStep[]): ApiWorkflow {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ''),
    environmentId: row.environment_id != null ? String(row.environment_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    steps
  }
}

function parseStepParamsJson(raw: string | undefined): Record<string, string> {
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

function loadSteps(db: ReturnType<typeof getDb>, workflowId: string): ApiWorkflowStep[] {
  const rows = db
    .prepare('SELECT * FROM api_workflow_steps WHERE workflow_id = ? ORDER BY sort_order ASC')
    .all(workflowId) as Record<string, unknown>[]
  return rows.map((row) => ({
    id: String(row.id),
    workflowId: String(row.workflow_id),
    sortOrder: Number(row.sort_order),
    name: String(row.name),
    method: row.method as ApiWorkflowStep['method'],
    url: String(row.url),
    headers: JSON.parse(String(row.headers_json || '{}')) as Record<string, string>,
    body: String(row.body ?? ''),
    extract: JSON.parse(String(row.extract_json || '{}')) as Record<string, string>,
    defaultParams: parseStepParamsJson(
      row.params_json != null ? String(row.params_json) : undefined
    )
  }))
}

export type ApiWorkflowStepInput = {
  name: string
  method: ApiWorkflowStep['method']
  url: string
  headers?: Record<string, string>
  body?: string
  extract?: Record<string, string>
  defaultParams?: Record<string, string>
}

export function registerApiWorkflowHandlers(): void {
  const db = getDb()

  ipcMain.handle(IPC.API_ENV_LIST, () => {
    const rows = db.prepare('SELECT * FROM api_environments ORDER BY updated_at DESC').all() as Record<
      string,
      unknown
    >[]
    return toIpcReply(rows.map(rowToEnv))
  })

  ipcMain.handle(IPC.API_ENV_GET, (_e, id: string) => {
    const row = db.prepare('SELECT * FROM api_environments WHERE id = ?').get(id) as Record<
      string,
      unknown
    > | null
    return toIpcReply(row ? rowToEnv(row) : null)
  })

  ipcMain.handle(
    IPC.API_ENV_CREATE,
    (_e, data: { name: string; bundle: SessionBundle }) => {
      const id = insertApiEnvironment(db, data.name, data.bundle)
      const row = db.prepare('SELECT * FROM api_environments WHERE id = ?').get(id) as Record<string, unknown>
      return toIpcReply(rowToEnv(row))
    }
  )

  ipcMain.handle(
    IPC.API_ENV_IMPORT_JSON,
    (_e, data: { name: string; json: string }) => {
      const bundle = parseSessionBundleJson(data.json)
      const id = insertApiEnvironment(db, data.name, bundle)
      const row = db.prepare('SELECT * FROM api_environments WHERE id = ?').get(id) as Record<string, unknown>
      return toIpcReply(rowToEnv(row))
    }
  )

  ipcMain.handle(
    IPC.API_ENV_UPDATE,
    (_e, id: string, data: { name?: string; bundle?: SessionBundle }) => {
      const now = new Date().toISOString()
      const cur = db.prepare('SELECT * FROM api_environments WHERE id = ?').get(id) as Record<
        string,
        unknown
      > | null
      if (!cur) throw new Error('环境不存在')
      const name = data.name ?? String(cur.name)
      const bundleJson =
        data.bundle != null ? JSON.stringify(data.bundle) : String(cur.bundle_json)
      db.prepare(`UPDATE api_environments SET name = ?, bundle_json = ?, updated_at = ? WHERE id = ?`).run(
        name,
        bundleJson,
        now,
        id
      )
      const row = db.prepare('SELECT * FROM api_environments WHERE id = ?').get(id) as Record<string, unknown>
      return toIpcReply(rowToEnv(row))
    }
  )

  ipcMain.handle(IPC.API_ENV_DELETE, (_e, id: string) => {
    db.prepare('DELETE FROM api_environments WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle(IPC.API_WORKFLOW_LIST, () => {
    const rows = db.prepare('SELECT * FROM api_workflows ORDER BY updated_at DESC').all() as Record<
      string,
      unknown
    >[]
    return toIpcReply(rows.map((r) => rowToWorkflow(r, loadSteps(db, String(r.id)))))
  })

  ipcMain.handle(IPC.API_WORKFLOW_GET, (_e, id: string) => {
    const row = db.prepare('SELECT * FROM api_workflows WHERE id = ?').get(id) as Record<
      string,
      unknown
    > | null
    return toIpcReply(row ? rowToWorkflow(row, loadSteps(db, id)) : null)
  })

  ipcMain.handle(
    IPC.API_WORKFLOW_CREATE,
    (
      _e,
      data: {
        name: string
        description?: string
        environmentId?: string | null
        steps: ApiWorkflowStepInput[]
      }
    ) => {
      const id = randomUUID()
      const now = new Date().toISOString()
      const envId = data.environmentId ?? null
      db.prepare(
        `INSERT INTO api_workflows (id, name, description, environment_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, data.name, data.description ?? '', envId, now, now)
      const steps = data.steps ?? []
      const ins = db.prepare(
        `INSERT INTO api_workflow_steps (id, workflow_id, sort_order, name, method, url, headers_json, body, extract_json, params_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      steps.forEach((s, i) => {
        ins.run(
          randomUUID(),
          id,
          i,
          s.name,
          s.method,
          s.url,
          JSON.stringify(s.headers ?? {}),
          s.body ?? '',
          JSON.stringify(s.extract ?? {}),
          JSON.stringify(s.defaultParams ?? {})
        )
      })
      const row = db.prepare('SELECT * FROM api_workflows WHERE id = ?').get(id) as Record<string, unknown>
      return toIpcReply(rowToWorkflow(row, loadSteps(db, id)))
    }
  )

  ipcMain.handle(
    IPC.API_WORKFLOW_UPDATE,
    (
      _e,
      id: string,
      data: {
        name?: string
        description?: string
        environmentId?: string | null
        steps?: ApiWorkflowStepInput[]
      }
    ) => {
      const cur = db.prepare('SELECT * FROM api_workflows WHERE id = ?').get(id) as Record<
        string,
        unknown
      > | null
      if (!cur) throw new Error('工作流不存在')
      const now = new Date().toISOString()
      const name = data.name ?? String(cur.name)
      const description = data.description ?? String(cur.description ?? '')
      const environmentId =
        data.environmentId !== undefined
          ? data.environmentId
          : cur.environment_id != null
            ? String(cur.environment_id)
            : null
      db.prepare(
        `UPDATE api_workflows SET name = ?, description = ?, environment_id = ?, updated_at = ? WHERE id = ?`
      ).run(name, description, environmentId, now, id)

      if (data.steps) {
        db.prepare('DELETE FROM api_workflow_steps WHERE workflow_id = ?').run(id)
        const ins = db.prepare(
          `INSERT INTO api_workflow_steps (id, workflow_id, sort_order, name, method, url, headers_json, body, extract_json, params_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        data.steps.forEach((s, i) => {
          ins.run(
            randomUUID(),
            id,
            i,
            s.name,
            s.method,
            s.url,
            JSON.stringify(s.headers ?? {}),
            s.body ?? '',
            JSON.stringify(s.extract ?? {}),
            JSON.stringify(s.defaultParams ?? {})
          )
        })
      }

      const row = db.prepare('SELECT * FROM api_workflows WHERE id = ?').get(id) as Record<string, unknown>
      return toIpcReply(rowToWorkflow(row, loadSteps(db, id)))
    }
  )

  ipcMain.handle(IPC.API_WORKFLOW_DELETE, (_e, id: string) => {
    db.prepare('DELETE FROM api_workflows WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle(IPC.API_WORKFLOW_RUN, async (_e, workflowId: string, opts?: unknown) => {
    const o = opts && typeof opts === 'object' && opts !== null ? (opts as Record<string, unknown>) : {}
    const h = o.httpHostEnv
    const httpHostEnv =
      h === 'prod' || h === 'test' || h === 'dev' ? h : undefined
    const result = await runApiWorkflow(db, workflowId, httpHostEnv ? { httpHostEnv } : undefined)
    return toIpcReply(result)
  })

  ipcMain.handle(IPC.API_WORKFLOW_TRY_STEP, async (_e, step: unknown, opts?: unknown) => {
    const s = step && typeof step === 'object' && step !== null ? (step as Record<string, unknown>) : {}
    const input: ApiWorkflowTryStepInput = {
      name: String(s.name ?? '步骤'),
      method: (s.method as ApiWorkflowTryStepInput['method']) ?? 'GET',
      url: String(s.url ?? ''),
      headers: (s.headers && typeof s.headers === 'object' ? s.headers : {}) as Record<string, string>,
      body: String(s.body ?? ''),
      extract:
        s.extract && typeof s.extract === 'object' && s.extract !== null
          ? (s.extract as Record<string, string>)
          : {},
      defaultParams:
        s.defaultParams && typeof s.defaultParams === 'object' && s.defaultParams !== null
          ? (s.defaultParams as Record<string, string>)
          : {}
    }
    const o = opts && typeof opts === 'object' && opts !== null ? (opts as Record<string, unknown>) : {}
    const h = o.httpHostEnv
    const httpHostEnv =
      h === 'prod' || h === 'test' || h === 'dev' ? h : undefined
    const result = await runApiWorkflowTryStep(
      db,
      input,
      httpHostEnv ? { httpHostEnv } : undefined
    )
    return toIpcReply(result)
  })

  ipcMain.handle(IPC.API_WORKFLOW_TRY_STEP_CURL, (_e, step: unknown, opts?: unknown) => {
    const s = step && typeof step === 'object' && step !== null ? (step as Record<string, unknown>) : {}
    const input: ApiWorkflowTryStepInput = {
      name: String(s.name ?? '步骤'),
      method: (s.method as ApiWorkflowTryStepInput['method']) ?? 'GET',
      url: String(s.url ?? ''),
      headers: (s.headers && typeof s.headers === 'object' ? s.headers : {}) as Record<string, string>,
      body: String(s.body ?? ''),
      extract:
        s.extract && typeof s.extract === 'object' && s.extract !== null
          ? (s.extract as Record<string, string>)
          : {},
      defaultParams:
        s.defaultParams && typeof s.defaultParams === 'object' && s.defaultParams !== null
          ? (s.defaultParams as Record<string, string>)
          : {}
    }
    const o = opts && typeof opts === 'object' && opts !== null ? (opts as Record<string, unknown>) : {}
    const h = o.httpHostEnv
    const httpHostEnv =
      h === 'prod' || h === 'test' || h === 'dev' ? h : undefined
    const r = buildTryStepCurl(db, input, httpHostEnv ? { httpHostEnv } : undefined)
    return toIpcReply('error' in r ? r : { curl: r.curl })
  })
}
