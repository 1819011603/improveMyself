<template>
  <div class="try-panel">
    <div v-if="!hasRun && !curl" class="try-empty">
      点击「发送调试」查看响应；可用「复制实际 cURL」仅生成命令（无需先发送）。
    </div>
    <template v-else>
      <div v-if="hasRun" class="try-meta">
        <el-tag v-if="status != null" :type="statusTagType" size="small">{{ status }}</el-tag>
        <span v-if="durationMs != null" class="meta-t">{{ durationMs }} ms</span>
        <span v-if="bytes != null" class="meta-t">{{ sizeLabel }}</span>
        <el-tag v-if="trunc" type="warning" size="small" effect="plain">展示已截断</el-tag>
      </div>
      <el-tabs v-model="activeTab" class="try-tabs">
        <el-tab-pane label="Body" name="body">
          <div class="sub-toolbar">
            <el-radio-group v-model="bodyMode" size="small">
              <el-radio-button label="pretty">Pretty</el-radio-button>
              <el-radio-button label="raw">Raw</el-radio-button>
            </el-radio-group>
            <el-button size="small" :disabled="!displaySource" @click="copyBody">复制</el-button>
          </div>
          <div v-if="displaySource" class="code-frame">
            <div class="line-gutter" aria-hidden="true">{{ gutterText }}</div>
            <pre class="hljs-pre"><code class="hljs" v-html="highlighted" /></pre>
          </div>
          <p v-else class="no-body">（无响应正文，或请先发送调试）</p>
          <el-collapse v-if="debugLog.trim()" class="log-collapse">
            <el-collapse-item title="运行日志" name="log">
              <pre class="log-pre">{{ debugLog }}</pre>
            </el-collapse-item>
          </el-collapse>
        </el-tab-pane>
        <el-tab-pane label="实际请求" name="curl">
          <div class="sub-toolbar">
            <el-button size="small" :disabled="!curl" @click="copyCurl">复制 cURL</el-button>
          </div>
          <div v-if="curl" class="code-frame curl-frame">
            <div class="line-gutter" aria-hidden="true">{{ curlGutter }}</div>
            <pre class="hljs-pre"><code class="hljs" v-html="curlHighlighted" /></pre>
          </div>
          <p v-else class="no-body">暂无 cURL</p>
        </el-tab-pane>
      </el-tabs>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
import plaintext from 'highlight.js/lib/languages/plaintext'
import bash from 'highlight.js/lib/languages/bash'
import 'highlight.js/styles/github.css'

hljs.registerLanguage('json', json)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('bash', bash)

const props = withDefaults(
  defineProps<{
    hasRun: boolean
    responseBody: string
    curl: string
    debugLog: string
    status: number | null
    durationMs: number | null
    bytes: number | null
    trunc: boolean
  }>(),
  {
    responseBody: '',
    curl: '',
    debugLog: '',
    status: null,
    durationMs: null,
    bytes: null,
    trunc: false
  }
)

const activeTab = ref<'body' | 'curl'>('body')
const bodyMode = ref<'pretty' | 'raw'>('pretty')

const prettyJson = computed(() => {
  const raw = props.responseBody ?? ''
  if (!raw.trim()) return null
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return null
  }
})

const displaySource = computed(() => {
  const raw = props.responseBody ?? ''
  if (!raw.trim()) return ''
  if (bodyMode.value === 'raw') return raw
  return prettyJson.value ?? raw
})

const langForBody = computed(() => {
  if (bodyMode.value === 'pretty' && prettyJson.value != null) return 'json'
  return 'plaintext'
})

const highlighted = computed(() => {
  const src = displaySource.value
  if (!src) return ''
  return hljs.highlight(src, { language: langForBody.value }).value
})

const gutterText = computed(() => {
  const src = displaySource.value
  if (!src) return ''
  const n = src.split('\n').length
  return Array.from({ length: n }, (_, i) => String(i + 1)).join('\n')
})

const curlHighlighted = computed(() => {
  if (!props.curl) return ''
  try {
    return hljs.highlight(props.curl, { language: 'bash' }).value
  } catch {
    return hljs.highlight(props.curl, { language: 'plaintext' }).value
  }
})

const curlGutter = computed(() => {
  if (!props.curl) return ''
  const n = props.curl.split('\n').length
  return Array.from({ length: n }, (_, i) => String(i + 1)).join('\n')
})

const statusTagType = computed(() => {
  const s = props.status
  if (s == null) return 'info'
  if (s >= 200 && s < 300) return 'success'
  if (s >= 400) return 'danger'
  return 'warning'
})

const sizeLabel = computed(() => {
  const b = props.bytes
  if (b == null) return '—'
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(2)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
})

function copyBody() {
  const t = displaySource.value
  if (!t) return
  void navigator.clipboard.writeText(t)
  ElMessage.success('已复制响应内容')
}

function copyCurl() {
  if (!props.curl) return
  void navigator.clipboard.writeText(props.curl)
  ElMessage.success('已复制 cURL')
}
</script>

<style scoped>
.try-panel {
  margin-top: 8px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  background: var(--el-fill-color-blank);
  overflow: hidden;
}

.try-empty {
  padding: 16px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.try-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.meta-t {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.try-tabs :deep(.el-tabs__header) {
  margin: 0;
  padding: 0 12px;
  background: var(--el-bg-color);
}

.try-tabs :deep(.el-tabs__content) {
  padding: 10px 12px 12px;
}

.sub-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.code-frame {
  display: grid;
  grid-template-columns: auto 1fr;
  max-height: min(48vh, 420px);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: auto;
  background: #f6f8fa;
}

.curl-frame {
  max-height: min(36vh, 280px);
}

.line-gutter {
  padding: 10px 8px 10px 10px;
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  text-align: right;
  user-select: none;
  background: #eaeef2;
  border-right: 1px solid var(--el-border-color-lighter);
  white-space: pre;
}

.hljs-pre {
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  background: transparent !important;
}

.hljs-pre :deep(.hljs) {
  background: transparent !important;
  padding: 0;
}

.no-body {
  margin: 8px 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.log-collapse {
  margin-top: 12px;
}

.log-pre {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--el-text-color-regular);
  max-height: 200px;
  overflow: auto;
}
</style>
