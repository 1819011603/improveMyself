<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">设置</h1>
    </div>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <span class="card-title">执行历史</span>
      </template>
      <p class="card-intro">完整执行列表（含定时任务、输出全文）在侧边栏「执行记录」中查看。</p>
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

    <el-card class="settings-card" shadow="never">
      <template #header>
        <span class="card-title">Chrome 扩展推送（本机）</span>
      </template>
      <p class="card-intro">
        DevKit 在 <code>127.0.0.1</code> 监听 HTTP，仅在你点击扩展里的「推送到 DevKit」时接收一次数据，不会定时轮询。扩展里请填写要采集
        Cookie 的域名（可多行）；若连接失败，请先保持本应用运行并在下方开启接收、检查端口未被占用。
      </p>
      <el-form label-width="180px" label-position="left" @submit.prevent>
        <el-form-item label="开启接收服务">
          <el-switch v-model="form.sessionReceiverEnabled" />
        </el-form-item>
        <el-form-item label="监听端口">
          <div class="field-row">
            <el-input-number
              v-model="form.sessionReceiverPort"
              :min="snapshot.sessionReceiverPortMin"
              :max="snapshot.sessionReceiverPortMax"
              :step="1"
              controls-position="right"
            />
            <span class="hint"
              >推送地址：<code>{{ pushEndpoint }}</code>；健康检查：<code>{{ healthEndpoint }}</code></span
            >
          </div>
        </el-form-item>
        <el-form-item label="访问口令（可选）">
          <div class="field-row">
            <el-input
              v-model="form.sessionReceiverToken"
              type="password"
              show-password
              clearable
              placeholder="留空则不校验；填写后扩展需填相同口令"
              style="max-width: 360px"
            />
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="settings-card" shadow="never">
      <template #header>
        <span class="card-title">HTTP 编排 · 全局参数与合并顺序</span>
      </template>
      <p class="card-intro">
        全局变量为扁平 JSON 对象（键值均为字符串）。运行工作流时与扩展推送的 <code>pushParams</code>、步骤「默认参数」按下方顺序合并；<strong>合法
        HTTP 头名的键</strong>会写入请求头并覆盖步骤 Headers JSON 中的同名键。默认顺序为：接口默认 → 全局 → 推送（推送覆盖能力最强）。
      </p>
      <el-form label-width="180px" label-position="left" @submit.prevent>
        <el-form-item label="全局参数 JSON">
          <el-input
            v-model="form.apiWorkflowGlobalParamsJson"
            type="textarea"
            :rows="6"
            placeholder='{"Authorization":"Bearer xxx"}'
            class="mono-input"
          />
        </el-form-item>
        <el-form-item label="参数层合并顺序">
          <el-select v-model="form.apiWorkflowParamLayerOrderKey" style="width: 100%; max-width: 520px">
            <el-option
              v-for="opt in paramLayerOrderOptions"
              :key="opt.key"
              :label="opt.label"
              :value="opt.key"
            />
          </el-select>
          <p class="hint">列表含义为从左到右叠加，<strong>右侧层覆盖左侧同名键</strong>。</p>
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
import type { ApiWorkflowParamLayer, AppSettingsSnapshot } from '@shared/types'

const defaultSessionSnap = {
  sessionReceiverEnabled: true,
  sessionReceiverPort: 17373,
  sessionReceiverPortMin: 1024,
  sessionReceiverPortMax: 65535,
  sessionReceiverToken: ''
} as const

function paramLayerKey(order: ApiWorkflowParamLayer[]): string {
  return order.join(',')
}

const paramLayerOrderOptions: { key: string; label: string; order: ApiWorkflowParamLayer[] }[] = [
  { key: 'step,global,push', label: '接口 → 全局 → 推送（推送优先覆盖，默认）', order: ['step', 'global', 'push'] },
  { key: 'step,push,global', label: '接口 → 推送 → 全局', order: ['step', 'push', 'global'] },
  { key: 'global,step,push', label: '全局 → 接口 → 推送', order: ['global', 'step', 'push'] },
  { key: 'global,push,step', label: '全局 → 推送 → 接口', order: ['global', 'push', 'step'] },
  { key: 'push,step,global', label: '推送 → 接口 → 全局', order: ['push', 'step', 'global'] },
  { key: 'push,global,step', label: '推送 → 全局 → 接口（接口优先覆盖）', order: ['push', 'global', 'step'] }
]

function bytesToKbRounded(bytes: number): number {
  return Math.round(bytes / 1024)
}

const snapshot = ref<AppSettingsSnapshot>({
  executionHistoryMaxCount: 200,
  executionHistoryMin: 10,
  executionHistoryMax: 10000,
  executionOutputMaxBytes: 1_000_000,
  executionOutputMinBytes: 65536,
  executionOutputLimitMaxBytes: 52428800,
  ...defaultSessionSnap,
  apiWorkflowGlobalParams: {},
  apiWorkflowParamLayerOrder: ['step', 'global', 'push']
})

const outputMinKb = computed(() => Math.floor(snapshot.value.executionOutputMinBytes / 1024))
const outputMaxKb = computed(() => Math.floor(snapshot.value.executionOutputLimitMaxBytes / 1024))

const form = ref({
  executionHistoryMaxCount: 200,
  executionOutputMaxKb: bytesToKbRounded(1_000_000),
  sessionReceiverEnabled: defaultSessionSnap.sessionReceiverEnabled,
  sessionReceiverPort: defaultSessionSnap.sessionReceiverPort,
  sessionReceiverToken: '',
  apiWorkflowGlobalParamsJson: '{}',
  apiWorkflowParamLayerOrderKey: 'step,global,push'
})
const saving = ref(false)

const pushEndpoint = computed(
  () => `http://127.0.0.1:${form.value.sessionReceiverPort}/devkit-session/push`
)
const healthEndpoint = computed(
  () => `http://127.0.0.1:${form.value.sessionReceiverPort}/devkit-session/health`
)

onMounted(async () => {
  try {
    const s = await window.api.settingsGet()
    snapshot.value = s
    form.value.executionHistoryMaxCount = s.executionHistoryMaxCount
    form.value.executionOutputMaxKb = bytesToKbRounded(s.executionOutputMaxBytes)
    form.value.sessionReceiverEnabled = s.sessionReceiverEnabled
    form.value.sessionReceiverPort = s.sessionReceiverPort
    form.value.sessionReceiverToken = s.sessionReceiverToken
    form.value.apiWorkflowGlobalParamsJson = JSON.stringify(s.apiWorkflowGlobalParams ?? {}, null, 2)
    const ok = paramLayerOrderOptions.some((o) => o.key === paramLayerKey(s.apiWorkflowParamLayerOrder))
    form.value.apiWorkflowParamLayerOrderKey = ok
      ? paramLayerKey(s.apiWorkflowParamLayerOrder)
      : 'step,global,push'
  } catch {
    ElMessage.error('加载设置失败')
  }
})

async function save() {
  saving.value = true
  try {
    let apiWorkflowGlobalParams: Record<string, string> = {}
    try {
      const parsed = JSON.parse(form.value.apiWorkflowGlobalParamsJson || '{}') as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('须为 JSON 对象')
      }
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') apiWorkflowGlobalParams[k] = v
        else if (v != null) apiWorkflowGlobalParams[k] = String(v)
      }
    } catch (e) {
      ElMessage.error((e as Error).message || '全局参数 JSON 无效')
      saving.value = false
      return
    }
    const orderOpt = paramLayerOrderOptions.find((o) => o.key === form.value.apiWorkflowParamLayerOrderKey)
    const apiWorkflowParamLayerOrder = orderOpt?.order ?? ['step', 'global', 'push']

    const s = await window.api.settingsSet({
      executionHistoryMaxCount: form.value.executionHistoryMaxCount,
      executionOutputMaxBytes: form.value.executionOutputMaxKb * 1024,
      sessionReceiverEnabled: form.value.sessionReceiverEnabled,
      sessionReceiverPort: form.value.sessionReceiverPort,
      sessionReceiverToken: form.value.sessionReceiverToken,
      apiWorkflowGlobalParams,
      apiWorkflowParamLayerOrder
    })
    snapshot.value = s
    form.value.executionHistoryMaxCount = s.executionHistoryMaxCount
    form.value.executionOutputMaxKb = bytesToKbRounded(s.executionOutputMaxBytes)
    form.value.sessionReceiverEnabled = s.sessionReceiverEnabled
    form.value.sessionReceiverPort = s.sessionReceiverPort
    form.value.sessionReceiverToken = s.sessionReceiverToken
    form.value.apiWorkflowGlobalParamsJson = JSON.stringify(s.apiWorkflowGlobalParams ?? {}, null, 2)
    const ok = paramLayerOrderOptions.some((o) => o.key === paramLayerKey(s.apiWorkflowParamLayerOrder))
    form.value.apiWorkflowParamLayerOrderKey = ok
      ? paramLayerKey(s.apiWorkflowParamLayerOrder)
      : 'step,global,push'
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

.card-intro {
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
  margin: -4px 0 12px;
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

.hint code,
.card-intro code {
  font-size: 12px;
  padding: 1px 4px;
  background: #f4f4f5;
  border-radius: 4px;
}

.mono-input :deep(textarea) {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
</style>
