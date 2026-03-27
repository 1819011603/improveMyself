import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/scripts'
    },
    {
      path: '/scripts',
      name: 'scripts',
      component: () => import('../pages/scripts/ScriptsPage.vue')
    },
    {
      path: '/cheatsheet',
      name: 'cheatsheet',
      component: () => import('../pages/cheatsheet/CheatsheetPage.vue')
    },
    {
      path: '/scheduler',
      name: 'scheduler',
      component: () => import('../pages/scheduler/SchedulerPage.vue')
    },
    {
      path: '/execution-logs',
      name: 'execution-logs',
      component: () => import('../pages/execution-history/ExecutionHistoryPage.vue')
    },
    {
      path: '/snippets',
      name: 'snippets',
      component: () => import('../pages/snippets/SnippetsPage.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../pages/settings/SettingsPage.vue')
    },
    {
      path: '/api-workflow',
      name: 'api-workflow',
      component: () => import('../pages/api-workflow/ApiWorkflowPage.vue')
    }
  ]
})

export default router
