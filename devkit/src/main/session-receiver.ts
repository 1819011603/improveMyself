import http from 'http'
import { getDb } from './db'
import {
  getSessionReceiverEnabled,
  getSessionReceiverPort,
  getSessionReceiverToken
} from './app-settings'
import { parseSessionBundleJson } from './api-workflow/session-bundle'
import { insertApiEnvironment } from './api-environment-insert'
import type { SessionBundle } from '../shared/types/api-workflow'

let server: http.Server | null = null

function isLocalhost(addr: string): boolean {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-DevKit-Token'
}

function sendJson(res: http.ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, {
    ...corsHeaders,
    'Content-Type': 'application/json; charset=utf-8'
  })
  res.end(JSON.stringify(body))
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function stopSessionReceiver(): void {
  if (server) {
    try {
      server.close()
    } catch {
      /* ignore */
    }
    server = null
  }
}

/** 停止后按当前设置重新监听（设置变更后调用） */
export function restartSessionReceiver(): void {
  stopSessionReceiver()
  startSessionReceiver()
}

export function startSessionReceiver(): void {
  const db = getDb()
  if (!getSessionReceiverEnabled(db)) {
    console.log('[DevKit] Session receiver: disabled in settings')
    return
  }
  const port = getSessionReceiverPort(db)
  const expectedToken = getSessionReceiverToken(db).trim()

  const s = http.createServer((req, res) => {
    void handleRequest(req, res, db, expectedToken)
  })

  s.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[DevKit] Session receiver: port ${port} in use, disable or change port in settings`)
    } else {
      console.error('[DevKit] Session receiver:', err)
    }
  })

  s.listen(port, '127.0.0.1', () => {
    server = s
    console.log(`[DevKit] Session receiver listening http://127.0.0.1:${port}/devkit-session/push`)
  })
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  db: ReturnType<typeof getDb>,
  expectedToken: string
): Promise<void> {
  const remote = req.socket.remoteAddress || ''
  if (!isLocalhost(remote)) {
    res.writeHead(403).end('Forbidden')
    return
  }

  const url = req.url?.split('?')[0] || ''

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders).end()
    return
  }

  if (req.method === 'GET' && url === '/devkit-session/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'devkit-session',
      port: getSessionReceiverPort(db)
    })
    return
  }

  if (req.method === 'POST' && url === '/devkit-session/push') {
    if (expectedToken) {
      const auth = req.headers.authorization || ''
      const hdr = (req.headers['x-devkit-token'] as string | undefined) || ''
      const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
      const ok = expectedToken === bearer || expectedToken === hdr.trim()
      if (!ok) {
        sendJson(res, 401, { ok: false, error: 'invalid_token' })
        return
      }
    }

    try {
      const raw = await readBody(req)
      const body = JSON.parse(raw) as {
        name?: string
        bundle?: SessionBundle
        json?: string
      }
      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        sendJson(res, 400, { ok: false, error: 'name_required' })
        return
      }
      let bundle: SessionBundle
      if (body.bundle != null && typeof body.bundle === 'object') {
        bundle = parseSessionBundleJson(JSON.stringify(body.bundle))
      } else if (typeof body.json === 'string') {
        bundle = parseSessionBundleJson(body.json)
      } else {
        sendJson(res, 400, { ok: false, error: 'bundle_or_json_required' })
        return
      }
      const id = insertApiEnvironment(db, body.name.trim(), bundle)
      sendJson(res, 200, { ok: true, environmentId: id, name: body.name.trim() })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendJson(res, 400, { ok: false, error: msg })
    }
    return
  }

  res.writeHead(404).end('Not Found')
}
