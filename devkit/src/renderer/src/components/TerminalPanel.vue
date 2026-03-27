<template>
  <div class="terminal-panel">
    <div class="terminal-header">
      <div class="terminal-status">
        <span class="status-dot" :class="statusClass" />
        <span class="status-text">{{ statusText }}</span>
        <span v-if="elapsedLabel" class="status-elapsed">{{ elapsedLabel }}</span>
      </div>
      <div class="terminal-actions">
        <el-button
          v-if="status === 'running'"
          size="small"
          type="danger"
          plain
          @click="emit('kill')"
        >
          终止
        </el-button>
        <el-button size="small" plain @click="clear">清空</el-button>
      </div>
    </div>
    <div ref="termEl" class="terminal-body" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import 'xterm/css/xterm.css'
import type { TaskStatus } from '@shared/types'

const props = defineProps<{
  status: TaskStatus
  startedAt?: number
  /** 最近一次结束后的总耗时（ms），用于 success/error 态展示 */
  lastRunDurationMs?: number | null
}>()

const emit = defineEmits<{
  kill: []
}>()

const termEl = ref<HTMLElement>()
let term: Terminal
let fitAddon: FitAddon
let resizeObserver: ResizeObserver

const liveElapsedMs = ref<number | null>(null)
let elapsedTimer: ReturnType<typeof setInterval> | null = null

const statusClass = computed(() => ({
  'dot-idle': props.status === 'idle',
  'dot-running': props.status === 'running',
  'dot-success': props.status === 'success',
  'dot-error': props.status === 'error'
}))

const statusText = computed(() =>
  ({
    idle: '就绪',
    running: '运行中',
    success: '已完成',
    error: '已失败'
  }[props.status])
)

const elapsedLabel = computed(() => {
  if (props.status === 'running' && liveElapsedMs.value !== null) {
    return `${liveElapsedMs.value} ms`
  }
  if (props.status === 'success' || props.status === 'error') {
    if (props.lastRunDurationMs != null && props.lastRunDurationMs >= 0) {
      return `${props.lastRunDurationMs} ms`
    }
  }
  return ''
})

watch(() => props.status, (s) => {
  if (s === 'running') {
    liveElapsedMs.value = 0
    elapsedTimer = setInterval(() => {
      liveElapsedMs.value = props.startedAt ? Date.now() - props.startedAt : 0
    }, 100)
  } else {
    if (elapsedTimer) {
      clearInterval(elapsedTimer)
      elapsedTimer = null
    }
  }
})

onMounted(() => {
  term = new Terminal({
    convertEol: true,
    theme: {
      background: '#0d1117',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      selectionBackground: 'rgba(56, 139, 253, 0.35)',
      black: '#010409',
      red: '#f85149',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#c9d1d9',
      brightBlack: '#484f58',
      brightRed: '#ff7b72',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc'
    },
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    lineHeight: 1.4,
    letterSpacing: 0.2,
    cursorBlink: false,
    disableStdin: true,
    scrollback: 8000,
    smoothScrollDuration: 0
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(termEl.value!)
  fitAddon.fit()

  resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(() => fitAddon.fit())
  })
  resizeObserver.observe(termEl.value!)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  term?.dispose()
  if (elapsedTimer) clearInterval(elapsedTimer)
})

function write(data: string) {
  term?.write(data)
}

function writeln(data: string) {
  term?.writeln(data)
}

function clear() {
  term?.clear()
}

defineExpose({ write, writeln, clear })
</script>

<style scoped>
.terminal-panel {
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid #30363d;
  background: #0d1117;
  min-height: 0;
  flex: 1;
}

.terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #161b22;
  border-bottom: 1px solid #30363d;
  min-height: 40px;
  flex-shrink: 0;
}

.terminal-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.dot-idle {
  background: #484f58;
}
.dot-running {
  background: #d29922;
  animation: pulse 1s ease-in-out infinite;
}
.dot-success {
  background: #3fb950;
}
.dot-error {
  background: #f85149;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.status-text {
  font-size: 12px;
  font-weight: 500;
  color: #8b949e;
}

.status-elapsed {
  font-size: 11px;
  color: #6e7681;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.terminal-actions {
  display: flex;
  gap: 8px;
}

.terminal-body {
  flex: 1;
  min-height: 180px;
  padding: 6px 8px 10px;
  overflow: hidden;
}

.terminal-body :deep(.xterm) {
  height: 100%;
}

.terminal-body :deep(.xterm-viewport) {
  overflow-y: auto !important;
}

.terminal-body :deep(.xterm-screen) {
  width: 100%;
}
</style>
