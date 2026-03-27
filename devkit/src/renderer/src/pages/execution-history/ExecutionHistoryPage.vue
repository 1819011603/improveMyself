<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">执行记录</h1>
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
    </div>

    <el-alert
      v-if="filters.taskId"
      type="info"
      class="task-alert"
      show-icon
      closable
      @close="clearTaskFilter"
    >
      当前仅展示定时任务「{{ taskNameHint || filters.taskId }}」的执行记录（含参数与输出）。
    </el-alert>

    <div class="filter-bar">
      <el-select v-model="filters.status" placeholder="状态" class="filter-item" @change="load">
        <el-option label="全部状态" value="all" />
        <el-option label="成功" value="success" />
        <el-option label="失败" value="error" />
        <el-option label="进行中" value="running" />
      </el-select>
      <el-select v-model="filters.source" placeholder="来源" class="filter-item" @change="load">
        <el-option label="全部来源" value="all" />
        <el-option label="仅脚本手动运行" value="script" />
        <el-option label="仅定时任务" value="task" />
      </el-select>
      <el-input
        v-model="filters.search"
        class="filter-search"
        clearable
        placeholder="搜索脚本名、任务名或记录 ID"
        @clear="load"
        @keyup.enter="load"
        @input="onSearchInput"
      />
      <el-button type="primary" plain @click="load">应用筛选</el-button>
    </div>

    <p class="intro">
      列表条数上限与「设置 → 执行历史 → 保留记录条数」一致；单条输出体积受「单条输出上限」限制。点「详情」可查看运行参数与完整日志。
    </p>

    <div v-if="loading && rows.length === 0" class="state-center">
      <el-skeleton :rows="8" animated />
    </div>

    <div v-else-if="rows.length === 0" class="state-center">
      <el-empty description="没有符合条件的记录" />
    </div>

    <div v-else class="table-wrap">
      <el-table :data="rows" stripe border height="100%" class="log-table">
        <el-table-column label="开始时间" min-width="148">
          <template #default="{ row }">{{ fmtDt(row.startedAt) }}</template>
        </el-table-column>
        <el-table-column label="结束时间" min-width="148">
          <template #default="{ row }">{{ row.finishedAt ? fmtDt(row.finishedAt) : '—' }}</template>
        </el-table-column>
        <el-table-column label="耗时" width="96" align="right">
          <template #default="{ row }">{{ durationText(row) }}</template>
        </el-table-column>
        <el-table-column label="来源" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.taskName" class="src-tag task">定时：{{ row.taskName }}</span>
            <span v-else class="src-tag script">脚本：{{ row.scriptName || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="92" align="center">
          <template #default="{ row }">
            <template v-if="row.finishedAt == null">
              <el-tag size="small" type="warning">进行中</el-tag>
            </template>
            <el-tag v-else-if="row.exitCode === 0" size="small" type="success">成功</el-tag>
            <el-tag v-else size="small" type="danger">失败</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="退出码" width="88" align="center">
          <template #default="{ row }">
            <span v-if="row.finishedAt == null">—</span>
            <span v-else>{{ row.exitCode ?? '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="运行参数" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <code class="params-code">{{ paramsPreview(row.params) }}</code>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="88" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="detailVisible"
      title="执行详情"
      width="min(92vw, 820px)"
      destroy-on-close
      class="detail-dialog"
    >
      <div v-if="detailLoading" class="detail-loading">加载中…</div>
      <template v-else-if="detailFull">
        <el-descriptions :column="2" border size="small" class="detail-desc">
          <el-descriptions-item label="记录 ID" :span="2">
            <code>{{ detailFull.id }}</code>
          </el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ fmtDt(detailFull.startedAt) }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">
            {{ detailFull.finishedAt ? fmtDt(detailFull.finishedAt) : '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="耗时">
            {{ durationTextFromFull(detailFull) }}
          </el-descriptions-item>
          <el-descriptions-item label="退出码">
            {{ detailFull.finishedAt == null ? '—' : (detailFull.exitCode ?? '—') }}
          </el-descriptions-item>
          <el-descriptions-item label="脚本">
            {{ detailListRow?.scriptName || detailFull.scriptId || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="定时任务">
            {{ detailListRow?.taskName || detailFull.taskId || '—' }}
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-section-title">运行参数（JSON）</div>
        <el-scrollbar max-height="160px">
          <pre class="json-pre">{{ paramsJson(detailFull.params) }}</pre>
        </el-scrollbar>

        <div class="detail-section-title">输出日志</div>
        <el-scrollbar max-height="50vh">
          <pre class="output-pre">{{ detailFull.output?.trim() ? detailFull.output : '（无输出）' }}</pre>
        </el-scrollbar>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { cloneForIpc } from '@shared/ipc-clone'
import type {
  ExecutionLog,
  ExecutionLogListItem,
  ExecutionLogListQuery,
  ExecutionLogSourceFilter,
  ExecutionLogStatusFilter
} from '@shared/types'

const route = useRoute()
const router = useRouter()

const rows = ref<ExecutionLogListItem[]>([])
const loading = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailFull = ref<ExecutionLog | null>(null)
const detailListRow = ref<ExecutionLogListItem | null>(null)
const taskNameHint = ref('')

const filters = reactive({
  status: 'all' as ExecutionLogStatusFilter,
  source: 'all' as ExecutionLogSourceFilter,
  taskId: '',
  search: ''
})

let searchDebounce: ReturnType<typeof setTimeout> | null = null

function syncFromRoute() {
  const q = route.query
  filters.taskId = typeof q.taskId === 'string' ? q.taskId : ''
  taskNameHint.value = typeof q.tn === 'string' ? String(q.tn) : ''
  if (q.source === 'task' || q.source === 'script') {
    filters.source = q.source as ExecutionLogSourceFilter
  } else if (!filters.taskId) {
    filters.source = 'all'
  }
}

function clearTaskFilter() {
  filters.taskId = ''
  taskNameHint.value = ''
  const q = { ...route.query } as Record<string, string | string[] | undefined>
  delete q.taskId
  delete q.tn
  router.replace({ path: '/execution-logs', query: q })
}

function fmtDt(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function durationText(row: ExecutionLogListItem) {
  if (!row.finishedAt) return '—'
  const ms = Date.parse(row.finishedAt) - Date.parse(row.startedAt)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function durationTextFromFull(log: ExecutionLog) {
  if (!log.finishedAt) return '—'
  const ms = Date.parse(log.finishedAt) - Date.parse(log.startedAt)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

function paramsPreview(p: Record<string, string>) {
  const keys = Object.keys(p || {})
  if (keys.length === 0) return '—'
  return keys.map((k) => `${k}=${p[k]}`).join(', ')
}

function paramsJson(p: Record<string, string>) {
  try {
    return JSON.stringify(p ?? {}, null, 2)
  } catch {
    return String(p)
  }
}

function onSearchInput() {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    searchDebounce = null
    void load()
  }, 400)
}

async function load() {
  loading.value = true
  try {
    const raw: Record<string, string> = {
      status: filters.status,
      source: filters.source
    }
    const tid = filters.taskId.trim()
    if (tid) raw.taskId = tid
    const sq = filters.search.trim()
    if (sq) raw.search = sq
    rows.value = await window.api.executionLogList(cloneForIpc(raw) as ExecutionLogListQuery)
  } catch {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

async function openDetail(row: ExecutionLogListItem) {
  detailListRow.value = row
  detailVisible.value = true
  detailLoading.value = true
  detailFull.value = null
  try {
    detailFull.value = await window.api.executionLogGet(row.id)
  } catch {
    ElMessage.error('加载详情失败')
  } finally {
    detailLoading.value = false
  }
}

watch(
  () => route.fullPath,
  () => {
    syncFromRoute()
    void load()
  }
)

onMounted(() => {
  syncFromRoute()
  void load()
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

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #1a1a2e;
}

.task-alert {
  flex-shrink: 0;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.filter-item {
  width: 140px;
}

.filter-search {
  width: min(100%, 280px);
}

.intro {
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
  max-width: 800px;
  flex-shrink: 0;
}

.table-wrap {
  flex: 1;
  min-height: 0;
}

.log-table {
  width: 100%;
}

.params-code {
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #606266;
}

.src-tag {
  font-size: 13px;
}
.src-tag.task {
  color: #b88230;
}
.src-tag.script {
  color: #303133;
}

.state-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-loading {
  padding: 24px;
  color: #909399;
}

.detail-desc {
  margin-bottom: 16px;
}

.detail-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin: 12px 0 8px;
}

.json-pre,
.output-pre {
  margin: 0;
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  color: #303133;
  background: #fafafa;
  border-radius: 6px;
}
</style>
