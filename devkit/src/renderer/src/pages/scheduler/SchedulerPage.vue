<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">定时任务</h1>
      <el-button type="primary" :icon="Plus" @click="showDialog = true">新建任务</el-button>
    </div>

    <div v-if="store.loading" class="state-center">
      <el-skeleton :rows="4" animated />
    </div>

    <div v-else-if="store.list.length === 0" class="state-center">
      <el-empty description="还没有定时任务">
        <el-button type="primary" @click="showDialog = true">新建任务</el-button>
      </el-empty>
    </div>

    <div v-else class="task-list">
      <el-card
        v-for="task in store.list"
        :key="task.id"
        shadow="never"
        class="task-card"
      >
        <div class="task-row">
          <el-switch
            :model-value="task.enabled"
            @change="store.toggle(task.id)"
          />
          <div class="task-info">
            <div class="task-name">{{ task.name }}</div>
            <div class="task-meta">
              <code class="cron-text">{{ task.cron }}</code>
              <el-tag
                size="small"
                :type="task.lastStatus === 'success' ? 'success' : task.lastStatus === 'error' ? 'danger' : 'info'"
              >
                {{ task.lastStatus || '未运行' }}
              </el-tag>
              <span v-if="task.lastRunAt" class="last-run">
                上次: {{ formatDate(task.lastRunAt) }}
              </span>
            </div>
          </div>
          <div class="task-actions">
            <el-button size="small" plain @click="store.runNow(task.id)">立即运行</el-button>
            <el-button size="small" type="danger" plain :icon="Delete" @click="confirmDelete(task)" />
          </div>
        </div>
      </el-card>
    </div>

    <el-dialog v-model="showDialog" title="新建定时任务" width="500px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="任务名称" />
        </el-form-item>
        <el-form-item label="脚本" prop="scriptId">
          <el-select v-model="form.scriptId" style="width: 100%" placeholder="选择要执行的脚本">
            <el-option v-for="s in scripts" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Cron" prop="cron">
          <el-input v-model="form.cron" placeholder="0 9 * * 1-5  (每周一到五 9:00)" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Plus, Delete } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useSchedulerStore } from '../../stores/scheduler'
import { useScriptsStore } from '../../stores/scripts'
import type { ScheduledTask } from '@shared/types'

const store = useSchedulerStore()
const scriptsStore = useScriptsStore()
const scripts = scriptsStore.list
const showDialog = ref(false)
const formRef = ref<FormInstance>()
const form = ref({ name: '', scriptId: '', cron: '', enabled: true, description: '', params: {} })
const rules = {
  name: [{ required: true, message: '请输入任务名称' }],
  scriptId: [{ required: true, message: '请选择脚本' }],
  cron: [{ required: true, message: '请输入 Cron 表达式' }]
}

let detachTaskSync: (() => void) | null = null

onMounted(() => {
  store.fetchList()
  scriptsStore.fetchList()
  detachTaskSync = window.api.onTaskListChanged(() => {
    void store.fetchList()
  })
})

onUnmounted(() => {
  detachTaskSync?.()
})

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function confirmDelete(task: ScheduledTask) {
  await ElMessageBox.confirm(`删除任务「${task.name}」？`, '删除确认', {
    type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消', confirmButtonClass: 'el-button--danger'
  })
  await store.remove(task.id)
  ElMessage.success('已删除')
}

async function submit() {
  await formRef.value?.validate()
  await store.create({ ...form.value })
  ElMessage.success('已创建')
  showDialog.value = false
  form.value = { name: '', scriptId: '', cron: '', enabled: true, description: '', params: {} }
}
</script>

<style scoped>
.page { height: 100vh; display: flex; flex-direction: column; padding: 24px; gap: 16px; overflow: hidden; }
.page-header { display: flex; align-items: center; justify-content: space-between; }
.page-title { font-size: 20px; font-weight: 600; color: #1a1a2e; }
.task-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.task-card { border: 1px solid #ebeef5; }
.task-row { display: flex; align-items: center; gap: 16px; }
.task-info { flex: 1; }
.task-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.task-meta { display: flex; align-items: center; gap: 8px; }
.cron-text { font-family: monospace; font-size: 12px; background: #f0f2f5; padding: 1px 5px; border-radius: 3px; }
.last-run { font-size: 12px; color: #909399; }
.task-actions { display: flex; gap: 6px; }
.state-center { flex: 1; display: flex; align-items: center; justify-content: center; }
</style>
