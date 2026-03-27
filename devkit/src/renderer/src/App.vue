<template>
  <el-container class="app-root">
    <!-- Sidebar -->
    <el-aside width="200px" class="sidebar">
      <div class="sidebar-logo">
        <span class="logo-icon">⚡</span>
        <span class="logo-text">DevKit</span>
      </div>

      <el-menu
        :default-active="activeRoute"
        router
        class="sidebar-menu"
      >
        <el-menu-item v-for="item in navItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- Main content -->
    <el-main class="main-content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Document, Timer, Memo, Collection, Setting } from '@element-plus/icons-vue'

const route = useRoute()
const activeRoute = computed(() => route.path)

const navItems = [
  { path: '/scripts',    label: '脚本库',    icon: Document },
  { path: '/cheatsheet', label: '命令速查',  icon: Memo },
  { path: '/scheduler',  label: '定时任务',  icon: Timer },
  { path: '/snippets',   label: '代码片段',  icon: Collection },
  { path: '/settings',   label: '设置',      icon: Setting }
]
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: transparent;
  overflow: hidden;
}

.app-root {
  height: 100vh;
  background: #f5f5f7;
}

.sidebar {
  background: rgba(30, 30, 40, 0.92);
  backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255,255,255,0.06);
  padding-top: 28px; /* space for macOS traffic lights */
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  margin-bottom: 8px;
}

.logo-icon {
  font-size: 20px;
}

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}

.sidebar-menu {
  background: transparent;
  border: none;
  flex: 1;
}

.sidebar-menu .el-menu-item {
  color: rgba(255,255,255,0.6);
  border-radius: 8px;
  margin: 2px 8px;
  height: 40px;
  transition: all 0.15s;
}

.sidebar-menu .el-menu-item:hover,
.sidebar-menu .el-menu-item.is-active {
  background: rgba(255,255,255,0.1) !important;
  color: #fff !important;
}

.sidebar-menu .el-menu-item.is-active {
  background: rgba(64, 158, 255, 0.25) !important;
  color: #409eff !important;
}

.main-content {
  padding: 0;
  overflow: hidden;
  background: #f5f5f7;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
