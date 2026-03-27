<template>
  <div class="page">
    <div class="page-header-row">
      <h1 class="page-title">HTTP 编排</h1>
      <div class="header-actions">
        <el-button link type="primary" @click="helpVisible = true">使用说明</el-button>
        <el-select v-model="httpHostEnv" class="env-select" @change="persistHttpHostEnv">
          <el-option label="生产 (prod)" value="prod" />
          <el-option label="测试 (test)" value="test" />
          <el-option label="开发 (dev)" value="dev" />
        </el-select>
      </div>
    </div>

    <p v-if="sessionSummaryLine" class="session-line">{{ sessionSummaryLine }}</p>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openWorkflowEditor(null)">新建工作流</el-button>
      <el-button @click="openImportEnv">从 JSON 导入</el-button>
      <el-button @click="refreshAll">刷新</el-button>
    </div>

    <el-table v-loading="wfLoading" :data="workflows" stripe border class="wf-table">
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column label="步骤" width="80">
        <template #default="{ row }">{{ row.steps?.length ?? 0 }}</template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" min-width="160">
        <template #default="{ row }">{{ fmtDt(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="360" fixed="right">
        <template #default="{ row }">
          <el-button type="success" size="small" :loading="runId === row.id" @click="runWorkflow(row)">
            运行
          </el-button>
          <el-button size="small" @click="viewWorkflowRun(row)">查看</el-button>
          <el-button size="small" @click="openWorkflowEditor(row)">编辑</el-button>
          <el-button type="danger" plain size="small" @click="onDeleteWf(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="importVisible" title="导入环境包 JSON" width="560px" destroy-on-close>
      <el-form label-width="88px">
        <el-form-item label="名称" required>
          <el-input v-model="importName" placeholder="例如：生产站点" />
        </el-form-item>
        <el-form-item label="JSON" required>
          <el-input v-model="importJson" type="textarea" :rows="12" placeholder="粘贴扩展导出的 JSON" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" :loading="importBusy" @click="submitImport">导入</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="helpVisible" title="HTTP 编排使用说明" width="560px" destroy-on-close class="help-dialog">
      <div class="help-body">
        <p>
          环境包可「从 JSON 导入」，或由 Chrome 扩展在<strong>你点击推送按钮时</strong>发到本机（非自动、非定时）。模板支持
          <code v-pre>{{vars.x}}</code>、<code v-pre>{{param.x}}</code>、<code v-pre>{{idx.0.body.data.id}}</code>。
        </p>
        <p>
          全局变量与参数合并顺序在<strong>设置</strong>中配置；合法键名会作为请求头与步骤 Headers 合并（后者覆盖前者见设置说明）。
        </p>
        <p>
          URL 请按<strong>生产 (prod)</strong>环境填写；选择测试/开发时会在三级域名最左段加 <code>test-</code> / <code>dev-</code> 前缀。
        </p>
        <p>
          编辑工作流时，在<strong>右侧步骤编辑区</strong>或「暂无步骤」空白处粘贴以 <code>curl</code> 开头的命令（与浏览器「复制为 cURL」一致），将自动解析方法、URL、Headers 与 Body。
        </p>
        <p>
          单步<strong>发送调试</strong>后，在「Body」中查看格式化与高亮的 JSON（可切换 Raw），在「实际请求」中查看与主进程一致的 cURL；<strong>复制实际 cURL</strong> 可仅生成命令而不发送。
        </p>
        <p v-if="sessionReceiverEnabled">
          本机接收已开启：扩展 POST 到
          <code>{{ pushUrl }}</code>
          （仅手动推送）。连接被拒绝时请确认 DevKit 已运行、端口一致。
        </p>
        <p v-else>
          本机接收已关闭：请到「设置」开启「Chrome 扩展推送」后扩展才能 POST 到 DevKit。
        </p>
      </div>
      <template #footer>
        <el-button type="primary" @click="helpVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="editorVisible"
      :title="editingWf?.id ? '编辑工作流' : '新建工作流'"
      width="920px"
      top="4vh"
      destroy-on-close
      class="wf-editor-dialog"
      @closed="resetEditor"
    >
      <el-form label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="wfForm.name" placeholder="工作流名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="wfForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>

      <div class="steps-head">
        <span class="steps-title">步骤按顺序执行（第 1 步为 idx.0）；右侧区域可粘贴 cURL</span>
        <el-button size="small" :icon="Plus" @click="addStepRow">添加步骤</el-button>
      </div>

      <div
        v-if="wfForm.steps.length === 0"
        class="steps-empty"
        tabindex="0"
        @paste.capture="onEmptyStepsPaste"
      >
        <p>暂无步骤。点击「添加步骤」，或在此区域粘贴以 <code>curl</code> 开头的命令（Ctrl+V / ⌘V）将自动新增一步并解析。</p>
      </div>

      <div v-else class="editor-split">
        <aside class="editor-rail" aria-label="步骤列表">
          <div class="rail-list">
            <button
              v-for="(row, idx) in wfForm.steps"
              :key="row.uid"
              type="button"
              class="rail-item"
              :class="{ active: idx === editorStepIndex }"
              @click="editorStepIndex = idx"
            >
              <span class="rail-idx">{{ idx }}</span>
              <span class="rail-method" :class="'m-' + row.method.toLowerCase()">{{ row.method }}</span>
              <span class="rail-title">{{ stepRailLabel(row, idx) }}</span>
            </button>
          </div>
        </aside>

        <main
          v-if="currentEditorStep"
          class="editor-detail"
          @paste.capture="(e) => onDetailPaste(e as ClipboardEvent)"
        >
          <div class="detail-top">
            <div class="detail-title-row">
              <span class="detail-badge">#{{ editorStepIndex }}</span>
              <el-input
                v-model="currentEditorStep.name"
                size="default"
                class="detail-name"
                placeholder="步骤名称"
              />
              <el-button type="danger" plain size="small" @click="removeStep(editorStepIndex)">
                删除此步骤
              </el-button>
            </div>
            <div class="request-line">
              <el-select v-model="currentEditorStep.method" class="method-select">
                <el-option v-for="m in methods" :key="m" :label="m" :value="m" />
              </el-select>
              <el-input v-model="currentEditorStep.url" placeholder="https://..." clearable />
            </div>
            <div class="debug-bar">
              <el-button type="primary" size="small" :loading="tryStepBusy" @click="runCurrentStepDebug">
                发送调试
              </el-button>
              <el-button size="small" :loading="tryCurlBusy" @click="copyCurrentStepCurl">
                复制实际 cURL
              </el-button>
            </div>
            <p class="debug-hint">调试与 cURL 均按当前页环境与设置合并参数、Cookie，与保存后运行一致。</p>
            <TryStepDebugResult
              :has-run="tryStepHasRun"
              :response-body="tryResponseBody"
              :curl="tryStepLastCurl"
              :debug-log="tryStepDebugLog"
              :status="tryStepHttpStatus"
              :duration-ms="tryDebugDurationMs"
              :bytes="tryDebugResponseBytes"
              :trunc="tryResponseTruncated"
            />
          </div>

          <el-tabs :key="currentEditorStep.uid" v-model="currentEditorStep.uiTab" class="step-tabs">
            <el-tab-pane lazy :label="`Params (${tabBadges.param})`" name="params">
              <el-input
                v-model="currentEditorStep.defaultParamsJson"
                type="textarea"
                :rows="7"
                placeholder='步骤级默认参数（合并为请求头），JSON 对象，值须为字符串'
                class="mono-textarea"
                @blur="refreshJsonTabBadges"
                @input="scheduleJsonTabBadges"
              />
            </el-tab-pane>
            <el-tab-pane lazy :label="`Headers (${tabBadges.header})`" name="headers">
              <div class="hdr-rows">
                <div
                  v-for="(hr, hi) in currentEditorStep.headerRows"
                  :key="hi"
                  class="hdr-row"
                >
                  <el-input
                    v-model="hr.key"
                    size="small"
                    placeholder="Header 名"
                    @blur="refreshCheapTabBadges"
                    @input="refreshCheapTabBadges"
                  />
                  <el-input
                    v-model="hr.value"
                    size="small"
                    placeholder="值"
                    @blur="refreshCheapTabBadges"
                    @input="refreshCheapTabBadges"
                  />
                  <el-button
                    type="danger"
                    link
                    size="small"
                    :disabled="currentEditorStep.headerRows.length <= 1"
                    @click="removeHeaderRow(editorStepIndex, hi)"
                  >
                    删
                  </el-button>
                </div>
              </div>
              <el-button class="hdr-add" size="small" :icon="Plus" @click="addHeaderRow(editorStepIndex)">
                添加一行
              </el-button>
            </el-tab-pane>
            <el-tab-pane lazy :label="`Body (${tabBadges.body})`" name="body">
              <el-input
                v-model="currentEditorStep.body"
                type="textarea"
                :rows="12"
                placeholder="请求体（如 JSON 原文）"
                class="mono-textarea"
                @blur="refreshCheapTabBadges"
                @input="refreshCheapTabBadges"
              />
            </el-tab-pane>
            <el-tab-pane lazy :label="`Extract (${tabBadges.extract})`" name="extract">
              <el-input
                v-model="currentEditorStep.extractJson"
                type="textarea"
                :rows="7"
                placeholder='从响应提取变量，如 {"token":"data.access_token"}'
                class="mono-textarea"
                @blur="refreshJsonTabBadges"
                @input="scheduleJsonTabBadges"
              />
            </el-tab-pane>
          </el-tabs>
        </main>
      </div>

      <template #footer>
        <el-button @click="editorVisible = false">取消</el-button>
        <el-button type="primary" :loading="saveBusy" @click="saveWorkflow">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="runResultVisible"
      :title="runResultDialogTitle"
      width="800px"
      top="6vh"
      destroy-on-close
      class="wf-run-dialog"
    >
      <el-alert type="warning" :closable="false" show-icon class="mb-12">
        日志与响应可能含敏感信息，请勿截图外发。
      </el-alert>
      <div class="wf-run-terminal-wrap">
        <TerminalPanel
          ref="runTerminalRef"
          :status="workflowRunPanelStatus"
          :started-at="runPanelStartedAt"
          :last-run-duration-ms="runLastDurationMs"
          :killable="false"
        />
      </div>
      <template #footer>
        <el-button type="primary" @click="runResultVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { cloneForIpc } from '@shared/ipc-clone'
import type {
  ApiEnvironment,
  ApiHttpHostEnv,
  ApiWorkflow,
  ApiWorkflowStep,
  ApiWorkflowTryStepResult,
  TaskStatus
} from '@shared/types'
import TerminalPanel from '../../components/TerminalPanel.vue'
import TryStepDebugResult from '../../components/TryStepDebugResult.vue'
import { tryParseCurl, type ParsedCurl } from '../../utils/parse-curl'

const HTTP_HOST_ENV_STORAGE = 'devkit.apiWorkflow.httpHostEnv'

const helpVisible = ref(false)
const httpHostEnv = ref<ApiHttpHostEnv>('prod')
const latestEnv = ref<ApiEnvironment | null>(null)
const workflows = ref<ApiWorkflow[]>([])
const wfLoading = ref(false)

const importVisible = ref(false)
const importName = ref('')
const importJson = ref('')
const importBusy = ref(false)

const editorVisible = ref(false)
const editingWf = ref<ApiWorkflow | null>(null)
const saveBusy = ref(false)
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const

type HeaderRow = { key: string; value: string }

type StepFormRow = {
  uid: string
  name: string
  method: ApiWorkflowStep['method']
  url: string
  defaultParamsJson: string
  headerRows: HeaderRow[]
  body: string
  extractJson: string
  uiTab: 'params' | 'headers' | 'body' | 'extract'
}

function newStepUid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const wfForm = ref({
  name: '',
  description: '',
  steps: [] as StepFormRow[]
})

/** 仅挂载当前选中步骤的表单，避免多组 Tabs/Table 同时存在导致卡顿 */
const editorStepIndex = ref(0)

const currentEditorStep = computed(() => {
  const i = editorStepIndex.value
  return wfForm.value.steps[i] ?? null
})

/** Tab 角标：Params/Extract 用失焦 + 输入防抖，避免每次按键 JSON.parse */
const tabBadges = ref({ param: 0, header: 0, body: 0, extract: 0 })
let jsonBadgeTimer: ReturnType<typeof setTimeout> | null = null

const tryStepBusy = ref(false)
const tryCurlBusy = ref(false)
const tryStepDebugLog = ref('')
const tryStepLastCurl = ref('')
const tryStepHasRun = ref(false)
const tryResponseBody = ref('')
const tryResponseTruncated = ref(false)
const tryDebugDurationMs = ref<number | null>(null)
const tryDebugResponseBytes = ref<number | null>(null)
const tryStepHttpStatus = ref<number | null>(null)

const runResultVisible = ref(false)
const runLogText = ref('')
const runId = ref<string | null>(null)
const runDialogWfId = ref<string | null>(null)
const lastRunLogByWfId = ref<Record<string, string>>({})
const lastRunOkByWfId = ref<Record<string, boolean>>({})

const runTerminalRef = ref<InstanceType<typeof TerminalPanel>>()
const workflowRunPanelStatus = ref<TaskStatus>('idle')
const runPanelStartedAt = ref<number | undefined>(undefined)
const runLastDurationMs = ref<number | null>(null)

const sessionReceiverEnabled = ref(true)
const sessionReceiverPort = ref(17373)

const pushUrl = computed(
  () => `http://127.0.0.1:${sessionReceiverPort.value}/devkit-session/push`
)

const sessionSummaryLine = computed(() => {
  const e = latestEnv.value
  if (!e) return '暂无会话数据：请从 JSON 导入或由扩展推送。'
  const n = e.bundle?.cookies?.length ?? 0
  const doms = e.bundle?.configuredDomains
  const domPart =
    doms?.length ? `配置域名：${doms.join('、')}；` : ''
  return `${domPart}Cookie ${n} 条 · ${e.name} · 更新 ${fmtDt(e.updatedAt)}`
})

const runResultDialogTitle = computed(() => {
  const id = runDialogWfId.value
  let base = '运行结果'
  if (id) {
    const name = workflows.value.find((w) => w.id === id)?.name
    base = name ? `运行结果 · ${name}` : '运行结果'
  }
  if (runId.value && runDialogWfId.value && runId.value === runDialogWfId.value) {
    return `${base}（运行中）`
  }
  return base
})

function syncRunTerminal() {
  const t = runTerminalRef.value
  if (!t) return
  t.clear()
  const text = runLogText.value
  if (text) t.write(text)
}

watch(
  [runResultVisible, runLogText],
  async () => {
    if (!runResultVisible.value) return
    await nextTick()
    await nextTick()
    syncRunTerminal()
  },
  { flush: 'post' }
)

function persistHttpHostEnv() {
  try {
    localStorage.setItem(HTTP_HOST_ENV_STORAGE, httpHostEnv.value)
  } catch {
    /* ignore */
  }
}

function loadHttpHostEnv() {
  try {
    const v = localStorage.getItem(HTTP_HOST_ENV_STORAGE)
    if (v === 'prod' || v === 'test' || v === 'dev') httpHostEnv.value = v
  } catch {
    /* ignore */
  }
}

function fmtDt(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function loadLatestSession() {
  const list = await window.api.apiEnvList()
  latestEnv.value = list[0] ?? null
}

async function loadWorkflows() {
  wfLoading.value = true
  try {
    workflows.value = await window.api.apiWorkflowList()
  } finally {
    wfLoading.value = false
  }
}

async function refreshAll() {
  await Promise.all([loadLatestSession(), loadWorkflows()])
}

function openImportEnv() {
  importName.value = ''
  importJson.value = ''
  importVisible.value = true
}

async function submitImport() {
  if (!importName.value.trim() || !importJson.value.trim()) {
    ElMessage.warning('请填写名称与 JSON')
    return
  }
  importBusy.value = true
  try {
    await window.api.apiEnvImportJson(
      cloneForIpc({ name: importName.value.trim(), json: importJson.value.trim() })
    )
    ElMessage.success('已导入')
    importVisible.value = false
    await loadLatestSession()
  } catch (e: unknown) {
    ElMessage.error((e as Error).message || '导入失败')
  } finally {
    importBusy.value = false
  }
}

function headersToRows(h: Record<string, string> | undefined): HeaderRow[] {
  const entries = h && typeof h === 'object' ? Object.entries(h) : []
  if (entries.length === 0) return [{ key: '', value: '' }]
  return entries.map(([key, value]) => ({ key, value: String(value) }))
}

function rowsToHeaders(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rows) {
    const k = r.key.trim()
    if (k) out[k] = r.value
  }
  return out
}

function emptyStep(): StepFormRow {
  return {
    uid: newStepUid(),
    name: '步骤',
    method: 'GET',
    url: '',
    defaultParamsJson: '{}',
    headerRows: [{ key: '', value: '' }],
    body: '',
    extractJson: '{}',
    uiTab: 'headers'
  }
}

function stepRailLabel(row: StepFormRow, idx: number): string {
  const n = row.name.trim()
  if (n) return n.length > 22 ? `${n.slice(0, 22)}…` : n
  const u = row.url.trim()
  if (u) {
    try {
      const p = new URL(u)
      const tail = (p.pathname + p.search).replace(/\/$/, '') || p.host
      return tail.length > 26 ? `${tail.slice(0, 26)}…` : tail
    } catch {
      return u.length > 26 ? `${u.slice(0, 26)}…` : u
    }
  }
  return `未命名 · ${idx}`
}

function jsonKeyCount(json: string): number {
  try {
    const o = JSON.parse(json.trim() || '{}') as unknown
    return o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o as object).length : 0
  } catch {
    return 0
  }
}

function headerActiveCount(row: StepFormRow): number {
  return row.headerRows.filter((r) => r.key.trim()).length
}

function bodyCount(row: StepFormRow): number {
  return row.body.trim() ? 1 : 0
}

function refreshCheapTabBadges() {
  const s = currentEditorStep.value
  if (!s) {
    tabBadges.value.header = 0
    tabBadges.value.body = 0
    return
  }
  tabBadges.value.header = headerActiveCount(s)
  tabBadges.value.body = bodyCount(s)
}

function refreshJsonTabBadges() {
  const s = currentEditorStep.value
  if (!s) {
    tabBadges.value.param = 0
    tabBadges.value.extract = 0
    return
  }
  tabBadges.value.param = jsonKeyCount(s.defaultParamsJson)
  tabBadges.value.extract = jsonKeyCount(s.extractJson)
}

function scheduleJsonTabBadges() {
  if (jsonBadgeTimer) clearTimeout(jsonBadgeTimer)
  jsonBadgeTimer = setTimeout(() => {
    jsonBadgeTimer = null
    refreshJsonTabBadges()
  }, 400)
}

function refreshAllTabBadges() {
  refreshCheapTabBadges()
  refreshJsonTabBadges()
}

watch(editorStepIndex, () => {
  refreshAllTabBadges()
  if (editorVisible.value) clearTryDebugUi()
})

watch(editorVisible, (vis) => {
  if (vis) {
    void nextTick(() => {
      refreshAllTabBadges()
    })
  }
})

function applyParsedCurlToStep(target: StepFormRow, p: ParsedCurl) {
  target.method = p.method
  target.url = p.url
  target.body = p.body
  const entries = Object.entries(p.headers)
  target.headerRows =
    entries.length > 0 ? entries.map(([key, value]) => ({ key, value })) : [{ key: '', value: '' }]
  if (!target.name.trim() || target.name === '步骤') {
    try {
      const u = new URL(p.url)
      const seg = u.pathname.split('/').filter(Boolean).pop()
      if (seg) target.name = seg.slice(0, 48)
    } catch {
      /* ignore */
    }
  }
  target.uiTab = p.body.trim() ? 'body' : 'headers'
  void nextTick(() => refreshAllTabBadges())
}

function onDetailPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text/plain') ?? ''
  const parsed = tryParseCurl(text)
  if (!parsed) return
  e.preventDefault()
  e.stopPropagation()
  const row = wfForm.value.steps[editorStepIndex.value]
  if (!row) return
  applyParsedCurlToStep(row, parsed)
  void nextTick(() => refreshAllTabBadges())
  ElMessage.success('已从 cURL 解析并填充当前步骤')
}

function onEmptyStepsPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text/plain') ?? ''
  const parsed = tryParseCurl(text)
  if (!parsed) return
  e.preventDefault()
  e.stopPropagation()
  wfForm.value.steps.push(emptyStep())
  editorStepIndex.value = wfForm.value.steps.length - 1
  const row = wfForm.value.steps[editorStepIndex.value]!
  applyParsedCurlToStep(row, parsed)
  void nextTick(() => refreshAllTabBadges())
  ElMessage.success('已新增步骤并从 cURL 解析')
}

function addHeaderRow(stepIndex: number) {
  const row = wfForm.value.steps[stepIndex]
  if (!row) return
  row.headerRows.push({ key: '', value: '' })
  refreshCheapTabBadges()
}

function removeHeaderRow(stepIndex: number, headerIndex: number) {
  const row = wfForm.value.steps[stepIndex]
  if (!row || row.headerRows.length <= 1) return
  row.headerRows.splice(headerIndex, 1)
  refreshCheapTabBadges()
}

function buildTryPayloadForCurrentStep(): Record<string, unknown> {
  const idx = editorStepIndex.value
  const row = wfForm.value.steps[idx]
  if (!row) throw new Error('无当前步骤')
  let extract: Record<string, string> = {}
  let defaultParams: Record<string, string> = {}
  try {
    extract = row.extractJson.trim() ? (JSON.parse(row.extractJson) as Record<string, string>) : {}
  } catch {
    throw new Error('Extract JSON 无效')
  }
  try {
    defaultParams = row.defaultParamsJson.trim()
      ? (JSON.parse(row.defaultParamsJson) as Record<string, string>)
      : {}
  } catch {
    throw new Error('Params（默认参数）JSON 无效')
  }
  for (const [k, v] of Object.entries(defaultParams)) {
    if (typeof v !== 'string') {
      throw new Error(`Params JSON 键「${k}」的值须为字符串`)
    }
  }
  return {
    name: row.name,
    method: row.method,
    url: row.url,
    headers: rowsToHeaders(row.headerRows),
    body: row.body,
    extract,
    defaultParams
  }
}

function applyTryStepResultToUi(res: ApiWorkflowTryStepResult) {
  tryStepHasRun.value = true
  tryStepDebugLog.value = res.log
  tryStepLastCurl.value = res.curl ?? ''
  tryResponseBody.value = res.responseBody ?? ''
  tryResponseTruncated.value = !!res.responseTruncated
  tryDebugDurationMs.value = res.debugDurationMs ?? null
  tryDebugResponseBytes.value = res.debugResponseBytes ?? null
  tryStepHttpStatus.value = res.steps[0]?.status ?? null
}

function clearTryDebugUi() {
  tryStepDebugLog.value = ''
  tryStepLastCurl.value = ''
  tryStepHasRun.value = false
  tryResponseBody.value = ''
  tryResponseTruncated.value = false
  tryDebugDurationMs.value = null
  tryDebugResponseBytes.value = null
  tryStepHttpStatus.value = null
}

async function runCurrentStepDebug() {
  if (!currentEditorStep.value) return
  if (!currentEditorStep.value.url.trim()) {
    ElMessage.warning('请填写 URL')
    return
  }
  let payload: Record<string, unknown>
  try {
    payload = buildTryPayloadForCurrentStep()
  } catch (e: unknown) {
    ElMessage.error((e as Error).message)
    return
  }
  tryStepBusy.value = true
  try {
    const res = await window.api.apiWorkflowTryStep(
      cloneForIpc(payload),
      cloneForIpc({ httpHostEnv: httpHostEnv.value })
    )
    applyTryStepResultToUi(res)
    if (res.ok) ElMessage.success('调试请求已完成')
    else ElMessage.warning('调试未成功，见下方结果')
  } catch (e: unknown) {
    tryStepHasRun.value = true
    tryStepDebugLog.value = (e as Error).message || String(e)
    tryStepLastCurl.value = ''
    tryResponseBody.value = ''
    tryResponseTruncated.value = false
    tryDebugDurationMs.value = null
    tryDebugResponseBytes.value = null
    tryStepHttpStatus.value = null
    ElMessage.error((e as Error).message || '调试请求失败')
  } finally {
    tryStepBusy.value = false
  }
}

async function copyCurrentStepCurl() {
  if (!currentEditorStep.value) return
  if (!currentEditorStep.value.url.trim()) {
    ElMessage.warning('请填写 URL')
    return
  }
  let payload: Record<string, unknown>
  try {
    payload = buildTryPayloadForCurrentStep()
  } catch (e: unknown) {
    ElMessage.error((e as Error).message)
    return
  }
  tryCurlBusy.value = true
  try {
    const r = (await window.api.apiWorkflowTryStepCurl(
      cloneForIpc(payload),
      cloneForIpc({ httpHostEnv: httpHostEnv.value })
    )) as { curl?: string; error?: string }
    if (r.error) {
      ElMessage.error(r.error)
      return
    }
    const curl = r.curl ?? ''
    if (!curl) {
      ElMessage.warning('未能生成 cURL')
      return
    }
    tryStepLastCurl.value = curl
    await navigator.clipboard.writeText(curl)
    ElMessage.success('已复制实际 cURL')
  } catch (e: unknown) {
    ElMessage.error((e as Error).message || '复制失败')
  } finally {
    tryCurlBusy.value = false
  }
}

function openWorkflowEditor(wf: ApiWorkflow | null) {
  editingWf.value = wf
  if (wf) {
    const steps = wf.steps?.length
      ? wf.steps.map((s) => ({
          uid: newStepUid(),
          name: s.name,
          method: s.method,
          url: s.url,
          defaultParamsJson: JSON.stringify(s.defaultParams ?? {}, null, 0),
          headerRows: headersToRows(s.headers ?? {}),
          body: s.body,
          extractJson: JSON.stringify(s.extract ?? {}, null, 0),
          uiTab: 'headers' as const
        }))
      : []
    wfForm.value = {
      name: wf.name,
      description: wf.description,
      steps
    }
    editorStepIndex.value = 0
  } else {
    wfForm.value = {
      name: '',
      description: '',
      steps: []
    }
    editorStepIndex.value = 0
  }
  editorVisible.value = true
  clearTryDebugUi()
  void nextTick(() => refreshAllTabBadges())
}

function resetEditor() {
  editingWf.value = null
  if (jsonBadgeTimer) {
    clearTimeout(jsonBadgeTimer)
    jsonBadgeTimer = null
  }
  clearTryDebugUi()
}

function addStepRow() {
  wfForm.value.steps.push(emptyStep())
  editorStepIndex.value = wfForm.value.steps.length - 1
}

function removeStep(i: number) {
  const was = editorStepIndex.value
  wfForm.value.steps.splice(i, 1)
  const n = wfForm.value.steps.length
  if (n === 0) {
    editorStepIndex.value = 0
    return
  }
  let next = was
  if (i < was) next = was - 1
  else if (i === was) next = Math.min(was, n - 1)
  editorStepIndex.value = Math.max(0, Math.min(next, n - 1))
}

function parseStepRows(): {
  name: string
  method: ApiWorkflowStep['method']
  url: string
  headers: Record<string, string>
  body: string
  extract: Record<string, string>
  defaultParams: Record<string, string>
}[] {
  return wfForm.value.steps.map((r) => {
    const headers = rowsToHeaders(r.headerRows)
    let extract: Record<string, string> = {}
    let defaultParams: Record<string, string> = {}
    try {
      extract = r.extractJson.trim() ? (JSON.parse(r.extractJson) as Record<string, string>) : {}
    } catch {
      throw new Error(`extract JSON 无效：${r.name}`)
    }
    try {
      defaultParams = r.defaultParamsJson.trim()
        ? (JSON.parse(r.defaultParamsJson) as Record<string, string>)
        : {}
    } catch {
      throw new Error(`默认参数 JSON 无效：${r.name}`)
    }
    if (defaultParams && typeof defaultParams === 'object') {
      for (const [k, v] of Object.entries(defaultParams)) {
        if (typeof v !== 'string') {
          throw new Error(`默认参数「${r.name}」的键 ${k} 须为字符串`)
        }
      }
    }
    return {
      name: r.name,
      method: r.method,
      url: r.url,
      headers,
      body: r.body,
      extract,
      defaultParams
    }
  })
}

async function saveWorkflow() {
  if (!wfForm.value.name.trim()) {
    ElMessage.warning('请填写工作流名称')
    return
  }
  if (wfForm.value.steps.length === 0) {
    ElMessage.warning('请至少添加一个步骤，或粘贴 cURL 自动创建')
    return
  }
  let stepsPayload: ReturnType<typeof parseStepRows>
  try {
    stepsPayload = parseStepRows()
  } catch (e: unknown) {
    ElMessage.error((e as Error).message)
    return
  }
  for (const s of stepsPayload) {
    if (!s.url.trim()) {
      ElMessage.warning('每步需填写 URL')
      return
    }
  }
  saveBusy.value = true
  try {
    const payload = {
      name: wfForm.value.name.trim(),
      description: wfForm.value.description.trim(),
      environmentId: null as string | null,
      steps: stepsPayload
    }
    if (editingWf.value?.id) {
      await window.api.apiWorkflowUpdate(editingWf.value.id, cloneForIpc(payload))
    } else {
      await window.api.apiWorkflowCreate(cloneForIpc(payload))
    }
    ElMessage.success('已保存')
    editorVisible.value = false
    await loadWorkflows()
  } catch (e: unknown) {
    ElMessage.error((e as Error).message || '保存失败')
  } finally {
    saveBusy.value = false
  }
}

async function onDeleteWf(row: ApiWorkflow) {
  await ElMessageBox.confirm(`删除工作流「${row.name}」？`, '确认', { type: 'warning' })
  await window.api.apiWorkflowDelete(row.id)
  ElMessage.success('已删除')
  await loadWorkflows()
}

function viewWorkflowRun(row: ApiWorkflow) {
  runDialogWfId.value = row.id
  if (runId.value === row.id) {
    workflowRunPanelStatus.value = 'running'
    runResultVisible.value = true
    return
  }
  const cached = lastRunLogByWfId.value[row.id]
  runLogText.value =
    cached ??
    '（尚未在本页运行过此工作流。点击「运行」将打开本窗口并立即执行；运行中的输出会在结束后显示在此处。）'
  if (row.id in lastRunOkByWfId.value) {
    workflowRunPanelStatus.value = lastRunOkByWfId.value[row.id] ? 'success' : 'error'
  } else {
    workflowRunPanelStatus.value = 'idle'
  }
  runPanelStartedAt.value = undefined
  runLastDurationMs.value = null
  runResultVisible.value = true
}

async function runWorkflow(row: ApiWorkflow) {
  runDialogWfId.value = row.id
  const started = Date.now()
  runPanelStartedAt.value = started
  workflowRunPanelStatus.value = 'running'
  runLastDurationMs.value = null
  runLogText.value = '运行中…\n'
  runResultVisible.value = true
  runId.value = row.id
  try {
    const res = await window.api.apiWorkflowRun(
      row.id,
      cloneForIpc({ httpHostEnv: httpHostEnv.value })
    )
    const text = (res.ok ? '状态：成功\n' : '状态：失败\n') + res.log
    runLogText.value = text
    lastRunLogByWfId.value = { ...lastRunLogByWfId.value, [row.id]: text }
    lastRunOkByWfId.value = { ...lastRunOkByWfId.value, [row.id]: res.ok }
    workflowRunPanelStatus.value = res.ok ? 'success' : 'error'
    runLastDurationMs.value = Date.now() - started
  } catch (e: unknown) {
    const errText = `运行失败\n${(e as Error).message || String(e)}`
    runLogText.value = errText
    lastRunLogByWfId.value = { ...lastRunLogByWfId.value, [row.id]: errText }
    lastRunOkByWfId.value = { ...lastRunOkByWfId.value, [row.id]: false }
    workflowRunPanelStatus.value = 'error'
    runLastDurationMs.value = Date.now() - started
    ElMessage.error((e as Error).message || '运行失败')
  } finally {
    runId.value = null
  }
}

onMounted(async () => {
  loadHttpHostEnv()
  try {
    const s = await window.api.settingsGet()
    sessionReceiverEnabled.value = s.sessionReceiverEnabled
    sessionReceiverPort.value = s.sessionReceiverPort
  } catch {
    /* ignore */
  }
  await refreshAll()
})
</script>

<style scoped>
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 24px;
  gap: 12px;
  overflow: hidden;
}

.page-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1a1a2e;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.env-select {
  width: 140px;
}

.session-line {
  margin: 0;
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
}

.toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.wf-table {
  flex: 1;
  min-height: 0;
}

.help-body p {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.6;
  color: #303133;
}

.help-body code {
  font-size: 12px;
  padding: 1px 4px;
  background: #f4f4f5;
  border-radius: 4px;
}

.steps-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0 8px;
}

.steps-title {
  font-size: 13px;
  color: #606266;
}

.steps-empty {
  padding: 20px 16px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
  margin-bottom: 8px;
}

.steps-empty p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
}

.steps-empty code {
  font-size: 12px;
  padding: 0 4px;
  background: #f4f4f5;
  border-radius: 4px;
}

.editor-split {
  display: flex;
  gap: 0;
  min-height: 320px;
  max-height: min(58vh, 520px);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  overflow: hidden;
  background: var(--el-bg-color);
}

.editor-rail {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-blank);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.rail-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rail-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 10px 10px;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--el-bg-color);
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.rail-item:hover {
  background: var(--el-fill-color-light);
  border-color: var(--el-border-color-lighter);
}

.rail-item.active {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
  box-shadow: 0 0 0 1px var(--el-color-primary-light-7);
}

.rail-idx {
  font-size: 11px;
  font-weight: 700;
  color: var(--el-text-color-secondary);
  min-width: 16px;
  line-height: 18px;
}

.rail-method {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 2px 5px;
  border-radius: 4px;
  line-height: 1.2;
  flex-shrink: 0;
}

.rail-method.m-get {
  color: #67c23a;
  background: rgba(103, 194, 58, 0.12);
}
.rail-method.m-post {
  color: #e6a23c;
  background: rgba(230, 162, 60, 0.14);
}
.rail-method.m-put,
.rail-method.m-patch {
  color: #409eff;
  background: rgba(64, 158, 255, 0.12);
}
.rail-method.m-delete {
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.12);
}
.rail-method.m-head {
  color: #909399;
  background: rgba(144, 147, 153, 0.14);
}

.rail-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.editor-detail {
  flex: 1;
  min-width: 0;
  padding: 14px 16px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-top {
  flex-shrink: 0;
}

.detail-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.detail-badge {
  font-size: 12px;
  font-weight: 700;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  padding: 4px 8px;
  border-radius: 6px;
}

.detail-name {
  flex: 1;
  min-width: 140px;
}

.request-line {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.debug-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 4px;
  margin-bottom: 6px;
}

.debug-hint {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.method-select {
  width: 112px;
  flex-shrink: 0;
}

.request-line :deep(.el-input) {
  flex: 1;
  min-width: 0;
}

.step-tabs {
  margin-top: 4px;
}

.step-tabs :deep(.el-tabs__content) {
  padding-top: 10px;
}

.hdr-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.hdr-row {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(120px, 1.35fr) auto;
  gap: 8px;
  align-items: center;
}

.hdr-add {
  margin-top: 2px;
}

.mono-textarea :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.wf-editor-dialog :deep(.el-dialog__body) {
  padding-top: 8px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}

.wf-run-dialog :deep(.el-dialog__body) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-top: 8px;
}

.wf-run-terminal-wrap {
  min-height: 360px;
  height: 50vh;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mb-12 {
  margin-bottom: 12px;
}
</style>
