<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">执行记录</h1>
      <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
    </div>
    <p class="intro">
      展示脚本库手动运行与定时任务触发的执行历史（含退出码与参数）。列表条数与「设置 → 执行历史 → 保留记录条数」一致；单条输出体积受「单条输出上限」限制。
    </p>

    <div v-if="loading && rows.length === 0" class="state-center">
      <el-skeleton :rows="8" animated />
    </div>

    <div v-else-if="rows.length === 0" class="state-center">
      <el-empty description="暂无执行记录" />
    </div>

    <div v-else class="table-wrap">
      <el-table :data="rows" stripe border height="100%" class="log-table">
        <el-table-column label="开始时间" min-width="152">
          <template #default="{ row }">{{ fmtDt(row.startedAt) }}</template>
        </el-table-column>
        <el-table-column label="结束时间" min-width="152">
          <template #default="{ row }">{{ row.finishedAt ? fmtDt(row.finishedAt) : '—' }}</template>
        </el-table-column>
        <el-table-column label="耗时" width="100" align="right">
          <template #default="{ row }">{{ durationText(row) }}</template>
        </el-table-column>
        <el-table-column label="来源" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.taskName" class="src-tag task">定时：{{ row.taskName }}</span>
            <span v-else class="src-tag script">脚本：{{ row.scriptName || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="退出码" width="100" align="center">
          <template #default="{ row }">
            <template v-if="row.finishedAt == null">
              <el-tag size="small" type="warning">进行中</el-tag>
            </template>
            <el-tag v-else-if="row.exitCode === 0" size="small" type="success">0</el-tag>
            <el-tag v-else size="small" type="danger">{{ row.exitCode ?? '—' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDetail(row)">查看输出</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="detailVisible" title="执行输出" width="min(92vw, 800px)" destroy-on-close>
      <div v-if="detailLoading" class="detail-loading">加载中…</div>
      <el-scrollbar v-else max-height="60vh">
        <pre class="output-pre">{{ detailOutput }}</pre>
      </el-scrollbar>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { ExecutionLogListItem } from '@shared/types'

const rows = ref<ExecutionLogListItem[]>([])
const loading = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailOutput = ref('')
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

async function load() {
  loading.value = true
  try {
    rows.value = await window.api.executionLogList()
  } catch {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

async function openDetail(row: ExecutionLogListItem) {
  detailVisible.value = true
  detailLoading.value = true
  detailOutput.value = ''
  try {
    const full = await window.api.executionLogGet(row.id)
    detailOutput.value = full?.output?.trim() ? full.output : '（无输出）'
  } catch {
    detailOutput.value = '加载失败'
    ElMessage.error('加载输出失败')
  } finally {
    detailLoading.value = false
  }
}

onMounted(() => {
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

.intro {
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
  max-width: 720px;
}

.table-wrap {
  flex: 1;
  min-height: 0;
}

.log-table {
  width: 100%;
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

.output-pre {
  margin: 0;
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  color: #303133;
}
</style>
