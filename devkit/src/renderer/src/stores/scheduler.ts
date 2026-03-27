import { defineStore } from 'pinia'
import { ref } from 'vue'
import { cloneForIpc } from '@shared/ipc-clone'
import type { ScheduledTask } from '@shared/types'

export const useSchedulerStore = defineStore('scheduler', () => {
  const list = ref<ScheduledTask[]>([])
  const loading = ref(false)

  async function fetchList() {
    loading.value = true
    try {
      list.value = await window.api.taskList()
    } finally {
      loading.value = false
    }
  }

  async function create(data: Omit<ScheduledTask, 'id' | 'createdAt'>) {
    const task = await window.api.taskCreate(cloneForIpc(data))
    list.value.unshift(task)
    return task
  }

  async function update(id: string, data: Partial<ScheduledTask>) {
    const task = await window.api.taskUpdate(id, cloneForIpc(data))
    const idx = list.value.findIndex((t) => t.id === id)
    if (idx !== -1) list.value[idx] = task
    return task
  }

  async function toggle(id: string) {
    const task = await window.api.taskToggle(id)
    const idx = list.value.findIndex((t) => t.id === id)
    if (idx !== -1) list.value[idx] = task
    return task
  }

  async function remove(id: string) {
    await window.api.taskDelete(id)
    list.value = list.value.filter((t) => t.id !== id)
  }

  async function runNow(id: string) {
    await window.api.taskRunNow(id)
  }

  return { list, loading, fetchList, create, update, toggle, remove, runNow }
})
