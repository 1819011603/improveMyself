<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? '编辑脚本' : '新建脚本'"
    width="720px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="名称" prop="name">
        <el-input
          v-model="form.name"
          maxlength="64"
          show-word-limit
          placeholder="最多 64 个字，如：清理 Docker 镜像"
        />
      </el-form-item>

      <el-form-item label="描述">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="2"
          placeholder="描述这个脚本的用途（可选）"
        />
      </el-form-item>

      <el-form-item label="标签">
        <el-select
          v-model="form.tags"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入标签后回车"
          style="width: 100%"
        />
      </el-form-item>

      <!-- Platform tabs -->
      <el-form-item label="脚本内容">
        <el-tabs v-model="activePlatform" style="width: 100%">
          <el-tab-pane label="macOS / Linux" name="macos">
            <div class="platform-config">
              <el-select v-model="form.platforms.macos.interpreter" style="width: 120px; margin-bottom: 8px">
                <el-option label="bash" value="bash" />
                <el-option label="zsh" value="zsh" />
                <el-option label="python3" value="python" />
                <el-option label="node" value="node" />
              </el-select>
              <el-input
                v-model="form.platforms.macos.content"
                type="textarea"
                :rows="8"
                placeholder="#!/bin/bash&#10;echo 'Hello World'"
                class="code-input"
              />
            </div>
          </el-tab-pane>
          <el-tab-pane label="Windows" name="windows">
            <div class="platform-config">
              <el-select v-model="form.platforms.windows.interpreter" style="width: 140px; margin-bottom: 8px">
                <el-option label="powershell" value="powershell" />
                <el-option label="cmd" value="cmd" />
                <el-option label="python" value="python" />
              </el-select>
              <el-input
                v-model="form.platforms.windows.content"
                type="textarea"
                :rows="8"
                placeholder="Write-Host 'Hello World'"
                class="code-input"
              />
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-form-item>

      <!-- Params -->
      <el-form-item label="参数">
        <div class="params-list">
          <div
            v-for="(param, idx) in form.params"
            :key="idx"
            class="param-row"
          >
            <el-input v-model="param.name" placeholder="占位符名（无空格），如 PORT → 脚本里写 {{PORT}}" style="width: 200px" />
            <el-input v-model="param.description" placeholder="说明" style="flex: 1" />
            <el-input v-model="param.defaultValue" placeholder="默认值" style="width: 120px" />
            <el-button :icon="Delete" type="danger" plain size="small" @click="removeParam(idx)" />
          </div>
          <el-button size="small" :icon="Plus" plain @click="addParam">添加参数</el-button>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import { useScriptsStore } from '../../stores/scripts'
import type { Script, ScriptParam } from '@shared/types'

const props = defineProps<{ modelValue: boolean; script: Script | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()

const store = useScriptsStore()
const formRef = ref<FormInstance>()
const saving = ref(false)
const activePlatform = ref('macos')
const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})
const isEdit = computed(() => !!props.script)

const defaultForm = () => ({
  name: '',
  description: '',
  tags: [] as string[],
  platforms: {
    macos: { content: '', interpreter: 'bash' as const },
    windows: { content: '', interpreter: 'powershell' as const }
  },
  params: [] as ScriptParam[]
})

const form = ref(defaultForm())

const SCRIPT_NAME_MAX = 64

const rules = {
  name: [
    { required: true, message: '请输入脚本名称', trigger: 'blur' },
    {
      max: SCRIPT_NAME_MAX,
      message: `名称不能超过 ${SCRIPT_NAME_MAX} 个字`,
      trigger: 'blur'
    }
  ]
}

watch(visible, (v) => {
  if (v) {
    if (props.script) {
      form.value = {
        name: props.script.name,
        description: props.script.description,
        tags: [...props.script.tags],
        platforms: {
          macos: { ...(props.script.platforms.macos || { content: '', interpreter: 'bash' }) },
          windows: { ...(props.script.platforms.windows || { content: '', interpreter: 'powershell' }) }
        },
        params: props.script.params.map((p) => ({ ...p }))
      }
    } else {
      form.value = defaultForm()
    }
  }
})

function addParam() {
  form.value.params.push({ name: '', description: '', defaultValue: '' })
}

function removeParam(idx: number) {
  form.value.params.splice(idx, 1)
}

async function submit() {
  await formRef.value?.validate()

  // Build platforms (only include non-empty)
  const platforms: Script['platforms'] = {}
  if (form.value.platforms.macos.content.trim()) {
    platforms.macos = form.value.platforms.macos
  }
  if (form.value.platforms.windows.content.trim()) {
    platforms.windows = form.value.platforms.windows
  }

  if (!platforms.macos && !platforms.windows) {
    ElMessage.warning('请至少填写一个平台的脚本内容')
    return
  }

  saving.value = true
  try {
    const data = { name: form.value.name, description: form.value.description, tags: form.value.tags, platforms, params: form.value.params.filter((p) => p.name.trim()) }
    if (isEdit.value && props.script) {
      await store.update(props.script.id, data)
    } else {
      await store.create(data)
    }
    ElMessage.success(isEdit.value ? '已更新' : '已创建')
    visible.value = false
    emit('saved')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(msg || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.platform-config {
  width: 100%;
}

.code-input :deep(textarea) {
  font-family: Menlo, Monaco, 'Courier New', monospace;
  font-size: 13px;
}

.params-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
