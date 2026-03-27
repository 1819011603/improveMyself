<template>
  <el-card class="script-card" shadow="never">
    <div class="card-body">
      <div class="card-info">
        <div class="card-name">{{ script.name }}</div>
        <div v-if="script.description" class="card-desc">{{ script.description }}</div>
        <div class="card-meta">
          <el-tag
            v-for="tag in script.tags"
            :key="tag"
            size="small"
            type="info"
            class="card-tag"
          >{{ tag }}</el-tag>
          <el-tag
            v-if="script.platforms.macos"
            size="small"
            type="success"
          >macOS</el-tag>
          <el-tag
            v-if="script.platforms.windows"
            size="small"
            type="warning"
          >Windows</el-tag>
        </div>
      </div>
      <div class="card-actions">
        <el-button type="primary" size="small" :icon="VideoPlay" @click="emit('run')">
          运行
        </el-button>
        <el-button size="small" :icon="Edit" @click="emit('edit')" />
        <el-button size="small" type="danger" plain :icon="Delete" @click="emit('delete')" />
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { VideoPlay, Edit, Delete } from '@element-plus/icons-vue'
import type { Script } from '@shared/types'

defineProps<{ script: Script }>()
const emit = defineEmits<{
  run: []
  edit: []
  delete: []
}>()
</script>

<style scoped>
.script-card {
  border: 1px solid #ebeef5;
  transition: box-shadow 0.2s;
}

.script-card:hover {
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
}

.card-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.card-name {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}

.card-desc {
  font-size: 13px;
  color: #909399;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
</style>
