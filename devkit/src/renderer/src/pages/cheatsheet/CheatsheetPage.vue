<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">命令速查</h1>
      <el-button type="primary" :icon="Plus" @click="showAddDialog = true">添加条目</el-button>
    </div>

    <div class="toolbar">
      <el-input
        v-model="searchText"
        placeholder="搜索命令、描述..."
        :prefix-icon="Search"
        clearable
        class="toolbar-search"
        @input="debouncedFetch"
      />
      <el-select
        v-model="selectedCategory"
        placeholder="全部分类"
        clearable
        style="width: 140px"
        @change="fetchData"
      >
        <el-option v-for="c in categories" :key="c.value" :label="c.label" :value="c.value" />
      </el-select>
    </div>

    <div v-if="store.loading" class="state-loading">
      <el-skeleton :rows="6" animated />
    </div>

    <div v-else-if="store.list.length === 0" class="state-empty">
      <el-empty description="没有找到相关命令" />
    </div>

    <div v-else class="cheatsheet-body">
      <!-- Group by category -->
      <div
        v-for="(entries, category) in groupedEntries"
        :key="category"
        class="category-group"
      >
        <div class="category-header">
          <el-tag type="info">{{ categoryLabel(category) }}</el-tag>
          <span class="entry-count">{{ entries.length }} 条</span>
        </div>
        <el-table :data="entries" size="small" :show-header="false" class="entry-table">
          <el-table-column width="320">
            <template #default="{ row }">
              <code class="cmd-text">{{ row.command }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="description" />
          <el-table-column width="80" align="right">
            <template #default="{ row }">
              <el-button
                size="small"
                plain
                :icon="CopyDocument"
                @click="copy(row.command)"
              />
              <el-button
                v-if="!row.isBuiltin"
                size="small"
                type="danger"
                plain
                :icon="Delete"
                @click="confirmDelete(row)"
              />
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- Add Dialog -->
    <el-dialog v-model="showAddDialog" title="添加命令" width="500px" destroy-on-close>
      <el-form ref="addFormRef" :model="addForm" :rules="addRules" label-width="70px">
        <el-form-item label="分类" prop="category">
          <el-select v-model="addForm.category" style="width: 100%">
            <el-option v-for="c in categories" :key="c.value" :label="c.label" :value="c.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="命令" prop="command">
          <el-input v-model="addForm.command" placeholder="git commit -m 'message'" />
        </el-form-item>
        <el-form-item label="说明" prop="description">
          <el-input v-model="addForm.description" placeholder="提交暂存区的改动" />
        </el-form-item>
        <el-form-item label="平台">
          <el-select v-model="addForm.platform" style="width: 100%">
            <el-option label="全平台" value="all" />
            <el-option label="macOS" value="macos" />
            <el-option label="Windows" value="windows" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="addSaving" @click="submitAdd">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Search, CopyDocument, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useCheatsheetStore } from '../../stores/cheatsheet'
import type { CheatsheetEntry } from '@shared/types'

const store = useCheatsheetStore()
const searchText = ref('')
const selectedCategory = ref('')
const showAddDialog = ref(false)
const addSaving = ref(false)
const addFormRef = ref<FormInstance>()

const categories = [
  { value: 'git',     label: 'Git' },
  { value: 'docker',  label: 'Docker' },
  { value: 'macos',   label: 'macOS 快捷键' },
  { value: 'terminal', label: '终端' },
  { value: 'vim',     label: 'Vim' },
  { value: 'network', label: '网络' },
  { value: 'process', label: '进程管理' },
  { value: 'custom',  label: '自定义' }
]

const categoryLabelMap = Object.fromEntries(categories.map((c) => [c.value, c.label]))
function categoryLabel(cat: string) { return categoryLabelMap[cat] || cat }

const defaultAddForm = () => ({
  category: 'custom' as CheatsheetEntry['category'],
  command: '',
  description: '',
  tags: [] as string[],
  platform: 'all' as CheatsheetEntry['platform']
})
const addForm = ref(defaultAddForm())
const addRules = {
  category: [{ required: true, message: '请选择分类' }],
  command:  [{ required: true, message: '请输入命令', trigger: 'blur' }],
  description: [{ required: true, message: '请输入说明', trigger: 'blur' }]
}

const groupedEntries = computed(() => {
  const map: Record<string, CheatsheetEntry[]> = {}
  for (const e of store.list) {
    if (!map[e.category]) map[e.category] = []
    map[e.category].push(e)
  }
  return map
})

let debounceTimer: ReturnType<typeof setTimeout>
function debouncedFetch() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(fetchData, 300)
}

function fetchData() {
  store.fetchList({
    search: searchText.value || undefined,
    category: selectedCategory.value || undefined
  })
}

onMounted(fetchData)

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  ElMessage.success('已复制')
}

async function confirmDelete(entry: CheatsheetEntry) {
  await ElMessageBox.confirm(`删除「${entry.command}」？`, '删除确认', {
    type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger'
  })
  await store.remove(entry.id)
  ElMessage.success('已删除')
}

async function submitAdd() {
  await addFormRef.value?.validate()
  addSaving.value = true
  try {
    await store.create(addForm.value)
    ElMessage.success('已添加')
    showAddDialog.value = false
    addForm.value = defaultAddForm()
  } finally {
    addSaving.value = false
  }
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

.toolbar-search { width: 300px; }

.cheatsheet-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-right: 4px;
}

.category-group {}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.entry-count {
  font-size: 12px;
  color: #c0c4cc;
}

.entry-table {
  border-radius: 6px;
  overflow: hidden;
}

.cmd-text {
  font-family: Menlo, Monaco, 'Courier New', monospace;
  font-size: 12px;
  background: #f0f2f5;
  padding: 2px 6px;
  border-radius: 3px;
}

.state-loading,
.state-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
