<template>
  <el-dialog
    v-model="visible"
    class="script-run-dialog"
    :title="`运行：${script?.name ?? ''}`"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
    align-center
  >
    <div v-if="script" class="dialog-inner">
      <div class="meta-bar">
        <span class="meta-item">新建 {{ fmtDt(script.createdAt) }}</span>
        <span class="meta-sep">·</span>
        <span class="meta-item">更新 {{ fmtDt(script.updatedAt) }}</span>
        <template v-if="lastRunDurationMs != null">
          <span class="meta-sep">·</span>
          <span class="meta-item">本次执行 {{ fmtDuration(lastRunDurationMs) }}</span>
        </template>
        <template v-if="currentPid != null">
          <span class="meta-sep">·</span>
          <span class="meta-item">PID {{ currentPid }}</span>
        </template>
      </div>

      <div class="toolbar-row">
        <el-button size="small" :icon="DocumentCopy" @click="copyScriptBody">复制正文</el-button>
      </div>

      <div class="script-body-section">
        <div class="section-label">脚本正文（可临时修改，仅本次运行；运行中只读）</div>
        <div class="interpreter-row">
          <span class="interp-label">解释器</span>
          <el-select
            v-model="draftInterpreter"
            size="small"
            class="interp-select"
            :disabled="execStatus === 'running'"
          >
            <el-option v-for="opt in interpreterOptions" :key="opt" :label="opt" :value="opt" />
          </el-select>
        </div>
        <el-input
          v-model="draftContent"
          type="textarea"
          :rows="8"
          class="script-textarea"
          placeholder="脚本内容"
          :disabled="execStatus === 'running'"
        />
      </div>

      <template v-if="script.params.length > 0">
        <div class="params-section">
          <div class="section-label">运行参数</div>
          <div v-for="param in script.params" :key="param.name" class="param-item">
            <div class="param-label">
              <code>{{ param.name }}</code>
              <span v-if="param.required" class="param-required">*</span>
            </div>
            <div class="param-desc">{{ param.description }}</div>
            <el-input
              v-model="paramValues[param.name]"
              :placeholder="param.defaultValue || '请输入'"
              size="small"
              :disabled="execStatus === 'running'"
            />
          </div>
        </div>
        <el-divider />
      </template>

      <TerminalPanel
        ref="terminalRef"
        class="terminal-wrap"
        :status="execStatus"
        :started-at="startedAt"
        :last-run-duration-ms="lastRunDurationMs"
        @kill="killProcess"
      />
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button v-if="execStatus === 'running'" type="danger" plain @click="killProcess">结束</el-button>
      <el-button type="primary" :disabled="execStatus === 'running'" @click="run">
        {{ runButtonLabel }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentCopy } from '@element-plus/icons-vue'
import TerminalPanel from '../../components/TerminalPanel.vue'
import { useScriptRunnerStore } from '../../stores/script-runner'
import type { Script, ScriptInterpreter, TaskStatus } from '@shared/types'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    script: Script | null
    /** 为 true 时，打开弹窗后若无进行中任务且必填参数已填则立即执行 */
    autoRunOnOpen?: boolean
  }>(),
  { autoRunOnOpen: false }
)
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const runner = useScriptRunnerStore()

function clientDefaultInterpreter(): ScriptInterpreter {
  const win =
    typeof navigator !== 'undefined' &&
    (/win/i.test(navigator.platform || '') || /windows/i.test(navigator.userAgent || ''))
  return win ? 'powershell' : 'bash'
}

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const terminalRef = ref<InstanceType<typeof TerminalPanel>>()
const paramValues = ref<Record<string, string>>({})
const draftContent = ref('')
const draftInterpreter = ref<ScriptInterpreter>(clientDefaultInterpreter())
const execStatus = ref<TaskStatus>('idle')
const currentExecutionId = ref<string | null>(null)
const startedAt = ref<number>()
const lastRunDurationMs = ref<number | null>(null)
const currentPid = ref<number | undefined>(undefined)

const interpreterOptions: ScriptInterpreter[] = [
  'bash',
  'zsh',
  'python',
  'node',
  'powershell',
  'cmd'
]

const runButtonLabel = computed(() => {
  if (execStatus.value === 'running') return '运行中…'
  if (execStatus.value === 'idle') return '运行'
  return '再次运行'
})

const currentPlatformConfig = computed(() => {
  const s = props.script
  if (!s) return undefined
  const win =
    typeof navigator !== 'undefined' &&
    (/win/i.test(navigator.platform || '') || /windows/i.test(navigator.userAgent || ''))
  const key = win ? 'windows' : 'macos'
  return s.platforms[key] ?? s.platforms.macos ?? s.platforms.windows
})

let unsubscribe: (() => void) | null = null

function fmtDt(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function resetFormFromScript() {
  const s = props.script
  if (!s) return
  const next: Record<string, string> = {}
  for (const p of s.params) {
    next[p.name] = p.defaultValue || ''
  }
  paramValues.value = next
  const cfg = currentPlatformConfig.value
  draftContent.value = cfg?.content ?? ''
  draftInterpreter.value = cfg?.interpreter ?? clientDefaultInterpreter()
}

function ensureOutputListener() {
  unsubscribe?.()
  unsubscribe = window.api.onScriptOutput(({ executionId, data, done, exitCode }) => {
    if (executionId !== currentExecutionId.value) return
    if (data) terminalRef.value?.write(data)
    if (done) {
      execStatus.value = exitCode === 0 ? 'success' : 'error'
      if (startedAt.value) {
        lastRunDurationMs.value = Date.now() - startedAt.value
      }
      terminalRef.value?.writeln(
        `\r\n\x1b[${exitCode === 0 ? '32' : '31'}m── 退出码 ${exitCode} ──\x1b[0m`
      )
      currentExecutionId.value = null
      currentPid.value = undefined
    }
  })
}

function canAutoRun(): boolean {
  const s = props.script
  if (!s) return false
  for (const p of s.params) {
    if (p.required && !String(paramValues.value[p.name] ?? '').trim()) {
      return false
    }
  }
  return true
}

async function startExecution() {
  const s = props.script
  if (!s) return

  terminalRef.value?.clear()
  execStatus.value = 'running'
  startedAt.value = Date.now()
  lastRunDurationMs.value = null
  currentPid.value = undefined
  ensureOutputListener()

  try {
    const res = await runner.start(s.id, { ...paramValues.value }, {
      content: draftContent.value,
      interpreter: draftInterpreter.value
    })
    currentExecutionId.value = res.executionId
    if (res.pid != null) currentPid.value = res.pid
  } catch (e: unknown) {
    execStatus.value = 'error'
    if (startedAt.value) {
      lastRunDurationMs.value = Date.now() - startedAt.value
    }
    terminalRef.value?.writeln(`\x1b[31m错误: ${(e as Error).message}\x1b[0m`)
    ElMessage.error('运行失败')
  }
}

async function onOpenDialog() {
  const s = props.script
  if (!s) return

  runner.attachGlobalListener()
  const existing = runner.getRun(s.id)

  if (existing) {
    const buf = await window.api.scriptExecutionBuffer(existing.executionId)
    paramValues.value = { ...existing.paramSnapshot }
    const cfg = currentPlatformConfig.value
    draftContent.value = existing.sourceContent ?? cfg?.content ?? ''
    draftInterpreter.value = existing.interpreter ?? cfg?.interpreter ?? clientDefaultInterpreter()
    execStatus.value = 'running'
    startedAt.value = existing.startedAt
    lastRunDurationMs.value = null
    currentPid.value = buf.pid ?? existing.pid
    await nextTick()
    terminalRef.value?.clear()
    if (buf.output) terminalRef.value?.write(buf.output)
    currentExecutionId.value = existing.executionId
    ensureOutputListener()
  } else {
    resetFormFromScript()
    execStatus.value = 'idle'
    lastRunDurationMs.value = null
    currentExecutionId.value = null
    currentPid.value = undefined
    await nextTick()
    terminalRef.value?.clear()
  }
}

watch(visible, async (v) => {
  if (v && props.script) {
    await onOpenDialog()
    if (props.autoRunOnOpen && execStatus.value === 'idle') {
      await nextTick()
      if (!canAutoRun()) {
        ElMessage.warning('请先填写必填运行参数后再点击「运行」')
      } else {
        await startExecution()
      }
    }
  }
  if (!v) cleanup()
})

watch(
  () => props.script,
  (s) => {
    if (s && visible.value && !runner.isRunning(s.id)) {
      resetFormFromScript()
    }
  }
)

async function run() {
  if (!props.script || execStatus.value === 'running') return
  await startExecution()
}

async function killProcess() {
  const s = props.script
  if (!s || !currentExecutionId.value) return
  await runner.stop(s.id)
  terminalRef.value?.writeln('\r\n\x1b[33m── 已终止 ──\x1b[0m')
  currentExecutionId.value = null
  currentPid.value = undefined
  execStatus.value = 'idle'
  if (startedAt.value) {
    lastRunDurationMs.value = Date.now() - startedAt.value
  }
}

async function copyScriptBody() {
  const text = draftContent.value?.trim() ?? ''
  if (!text) {
    ElMessage.warning('脚本正文为空')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}

function cleanup() {
  unsubscribe?.()
  unsubscribe = null
}

onUnmounted(cleanup)
</script>

<style scoped>
.dialog-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  flex: 1;
  min-height: 360px;
}

.meta-bar {
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
  flex-shrink: 0;
}

.meta-sep {
  margin: 0 6px;
  color: #c0c4cc;
}

.meta-item {
  white-space: nowrap;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.script-body-section {
  flex-shrink: 0;
}

.interpreter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.interp-label {
  font-size: 12px;
  color: #606266;
  flex-shrink: 0;
}

.interp-select {
  width: 160px;
}

.script-textarea :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
}

.params-section {
  flex-shrink: 0;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 10px;
}

.param-item {
  margin-bottom: 10px;
}

.param-label {
  font-size: 13px;
  margin-bottom: 2px;
}

.param-label code {
  background: #f0f2f5;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}

.param-required {
  color: #f56c6c;
  margin-left: 2px;
}

.param-desc {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.terminal-wrap {
  min-height: 180px;
  flex: 1;
}
</style>

<!-- 挂到 body 上，须用全局选择器才能作用到 .el-dialog -->
<style>
.script-run-dialog.el-dialog {
  display: flex !important;
  flex-direction: column;
  width: min(92vw, 900px) !important;
  height: min(82vh, 760px) !important;
  max-width: 96vw;
  max-height: 92vh;
  min-width: 520px;
  min-height: 420px;
  margin: 4vh auto !important;
  resize: both;
  overflow: hidden;
  padding: 0;
}

.script-run-dialog .el-dialog__header {
  flex-shrink: 0;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.script-run-dialog .el-dialog__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
}

.script-run-dialog .el-dialog__footer {
  flex-shrink: 0;
  padding: 10px 16px 14px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
