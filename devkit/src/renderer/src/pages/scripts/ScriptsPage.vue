<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">脚本库</h1>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">新建脚本</el-button>
    </div>

    <div class="toolbar">
      <el-input
        v-model="searchText"
        placeholder="搜索脚本名称、描述..."
        :prefix-icon="Search"
        clearable
        class="toolbar-search"
        @input="debouncedFetch"
      />
    </div>

    <div v-if="store.loading" class="state-loading">
      <el-skeleton :rows="6" animated />
    </div>

    <div v-else-if="store.list.length === 0" class="state-empty">
      <el-empty description="还没有脚本，点击「新建脚本」开始">
        <el-button type="primary" @click="openCreateDialog">新建脚本</el-button>
      </el-empty>
    </div>

    <div v-else class="table-wrap">
      <el-table :data="store.list" stripe border class="script-table" height="100%">
        <el-table-column label="名称" min-width="220" class-name="col-script-name">
          <template #default="{ row }">
            <span class="script-name-cell">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="160" show-overflow-tooltip />
        <el-table-column label="标签" min-width="100">
          <template #default="{ row }">
            <el-tag v-for="t in row.tags" :key="t" size="small" class="tag-mr">{{ t }}</el-tag>
            <el-tag v-if="row.platforms?.macos" size="small" type="success" class="tag-mr">macOS</el-tag>
            <el-tag v-if="row.platforms?.windows" size="small" type="warning">Win</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="新建时间" min-width="148">
          <template #default="{ row }">{{ fmtDt(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="变更时间" min-width="148">
          <template #default="{ row }">{{ fmtDt(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="上次执行" min-width="148">
          <template #default="{ row }">{{ row.lastExecutedAt ? fmtDt(row.lastExecutedAt) : '—' }}</template>
        </el-table-column>
        <el-table-column label="已运行时间" width="120" align="right">
          <template #default="{ row }">
            <span v-if="runner.isRunning(row.id)">{{ fmtRunMs(nowTick - (runner.getRun(row.id)?.startedAt ?? nowTick)) }}</span>
            <span v-else-if="row.lastRunDurationMs != null">{{ fmtRunMs(row.lastRunDurationMs) }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="440" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" size="small" :icon="VideoPlay" @click="openRunDialog(row, true)">
              运行
            </el-button>
            <el-button size="small" :icon="View" @click="openRunDialog(row, false)">查看</el-button>
            <el-button
              v-if="runner.isRunning(row.id)"
              type="danger"
              size="small"
              :icon="VideoPause"
              @click="onStopRow(row)"
            >
              结束
            </el-button>
            <el-button size="small" :icon="CopyDocument" @click="onDuplicate(row)" />
            <el-button size="small" :icon="Edit" @click="openEditDialog(row)" />
            <el-button size="small" type="danger" plain :icon="Delete" @click="confirmDelete(row)" />
          </template>
        </el-table-column>
      </el-table>
    </div>

    <ScriptFormDialog v-model="formVisible" :script="editingScript" @saved="onSaved" />

    <ScriptRunDialog v-model="runVisible" :script="runningScript" :auto-run-on-open="runAutoStart" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Plus, Search, VideoPlay, VideoPause, Edit, Delete, CopyDocument, View } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { useScriptsStore } from '../../stores/scripts'
import { useScriptRunnerStore } from '../../stores/script-runner'
import type { Script } from '@shared/types'
import ScriptFormDialog from './ScriptFormDialog.vue'
import ScriptRunDialog from './ScriptRunDialog.vue'

const store = useScriptsStore()
const runner = useScriptRunnerStore()
const searchText = ref('')
const formVisible = ref(false)
const runVisible = ref(false)
const runAutoStart = ref(false)
const editingScript = ref<Script | null>(null)
const runningScript = ref<Script | null>(null)

const nowTick = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null

watch(
  () => runner.runningScriptIds.length,
  (n) => {
    if (n > 0) {
      if (!tickTimer) tickTimer = setInterval(() => (nowTick.value = Date.now()), 400)
    } else if (tickTimer) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  },
  { immediate: true }
)

watch(runVisible, (v) => {
  if (!v) runAutoStart.value = false
})

let debounceTimer: ReturnType<typeof setTimeout>
function debouncedFetch() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    store.fetchList({ search: searchText.value || undefined })
  }, 300)
}

function fmtDt(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtRunMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

onMounted(() => {
  runner.attachGlobalListener()
  store.fetchList()
})

onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
})

function openCreateDialog() {
  editingScript.value = null
  formVisible.value = true
}

function openEditDialog(script: Script) {
  editingScript.value = script
  formVisible.value = true
}

function openRunDialog(script: Script, autoRun: boolean) {
  runningScript.value = script
  runAutoStart.value = autoRun
  runVisible.value = true
}

async function onStopRow(script: Script) {
  const { ok, alreadyEnded } = await runner.stop(script.id)
  if (alreadyEnded || !ok) {
    ElMessage.info('脚本已结束')
  }
}

async function onDuplicate(script: Script) {
  await store.duplicate(script)
  ElMessage.success('已复制为「' + script.name + '_copy」')
  debouncedFetch()
}

function onSaved() {
  store.fetchList({ search: searchText.value || undefined })
}

async function confirmDelete(script: Script) {
  await ElMessageBox.confirm(
    `确定删除脚本「${script.name}」？此操作不可撤销。`,
    '删除确认',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger' }
  )
  await store.remove(script.id)
  ElMessage.success('已删除')
}
</script>

<style scoped>
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 24px;
  gap: 16px;
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

.toolbar {
  display: flex;
  gap: 10px;
}

.toolbar-search {
  width: 320px;
}

.table-wrap {
  flex: 1;
  min-height: 0;
}

.script-table {
  width: 100%;
}

.script-table :deep(.col-script-name .cell) {
  line-height: 1.45;
}

.script-name-cell {
  display: inline-block;
  max-width: 100%;
  white-space: normal;
  word-break: break-word;
}

.tag-mr {
  margin-right: 4px;
}

.state-loading,
.state-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
