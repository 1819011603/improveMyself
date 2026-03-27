<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-title">代码片段</h1>
    </div>
    <div class="state-center">
      <el-empty description="代码片段功能即将上线（Phase 3）" />
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.page { height: 100vh; display: flex; flex-direction: column; padding: 24px; gap: 16px; }
.page-header { display: flex; align-items: center; justify-content: space-between; }
.page-title { font-size: 20px; font-weight: 600; color: #1a1a2e; }
.state-center { flex: 1; display: flex; align-items: center; justify-content: center; }
</style>
