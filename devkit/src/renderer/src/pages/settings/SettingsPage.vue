<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">设置</h1>
    </div>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <span class="card-title">执行历史</span>
      </template>
      <el-form label-width="180px" label-position="left" @submit.prevent>
        <el-form-item label="保留记录条数">
          <div class="field-row">
            <el-input-number
              v-model="form.executionHistoryMaxCount"
              :min="snapshot.executionHistoryMin"
              :max="snapshot.executionHistoryMax"
              :step="50"
              controls-position="right"
            />
            <span class="hint">仅统计已结束的任务；超出时删除更早的记录。</span>
          </div>
        </el-form-item>
        <el-form-item label="单条输出上限">
          <div class="field-row">
            <el-input-number
              v-model="form.executionOutputMaxKb"
              :min="outputMinKb"
              :max="outputMaxKb"
              :step="64"
              :precision="0"
              controls-position="right"
            />
            <span class="hint">
              单位：KB（1 KB = 1024 字节）。允许范围 {{ outputMinKb }}～{{ outputMaxKb }} KB。超出后仅保留 UTF-8
              末尾。
            </span>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { AppSettingsSnapshot } from '@shared/types'

function bytesToKbRounded(bytes: number): number {
  return Math.round(bytes / 1024)
}

const snapshot = ref<AppSettingsSnapshot>({
  executionHistoryMaxCount: 200,
  executionHistoryMin: 10,
  executionHistoryMax: 10000,
  executionOutputMaxBytes: 1_000_000,
  executionOutputMinBytes: 65536,
  executionOutputLimitMaxBytes: 52428800
})

const outputMinKb = computed(() => Math.floor(snapshot.value.executionOutputMinBytes / 1024))
const outputMaxKb = computed(() => Math.floor(snapshot.value.executionOutputLimitMaxBytes / 1024))

const form = ref({
  executionHistoryMaxCount: 200,
  executionOutputMaxKb: bytesToKbRounded(1_000_000)
})
const saving = ref(false)

onMounted(async () => {
  try {
    const s = await window.api.settingsGet()
    snapshot.value = s
    form.value.executionHistoryMaxCount = s.executionHistoryMaxCount
    form.value.executionOutputMaxKb = bytesToKbRounded(s.executionOutputMaxBytes)
  } catch {
    ElMessage.error('加载设置失败')
  }
})

async function save() {
  saving.value = true
  try {
    const s = await window.api.settingsSet({
      executionHistoryMaxCount: form.value.executionHistoryMaxCount,
      executionOutputMaxBytes: form.value.executionOutputMaxKb * 1024
    })
    snapshot.value = s
    form.value.executionHistoryMaxCount = s.executionHistoryMaxCount
    form.value.executionOutputMaxKb = bytesToKbRounded(s.executionOutputMaxBytes)
    ElMessage.success('已保存')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
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
  overflow: auto;
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

.settings-card {
  max-width: 720px;
  border: 1px solid #ebeef5;
}

.card-title {
  font-weight: 600;
}

.field-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  max-width: 520px;
}
</style>
