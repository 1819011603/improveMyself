import { defineStore } from 'pinia'
import { ref } from 'vue'
import { cloneForIpc } from '@shared/ipc-clone'
import type { CheatsheetEntry } from '@shared/types'

export const useCheatsheetStore = defineStore('cheatsheet', () => {
  const list = ref<CheatsheetEntry[]>([])
  const loading = ref(false)

  async function fetchList(opts?: { search?: string; category?: string }) {
    loading.value = true
    try {
      list.value = await window.api.cheatsheetList(cloneForIpc(opts ?? {}))
    } finally {
      loading.value = false
    }
  }

  async function create(data: Omit<CheatsheetEntry, 'id' | 'isBuiltin'>) {
    const entry = await window.api.cheatsheetCreate(cloneForIpc(data))
    list.value.push(entry)
    return entry
  }

  async function remove(id: string) {
    await window.api.cheatsheetDelete(id)
    list.value = list.value.filter((e) => e.id !== id)
  }

  return { list, loading, fetchList, create, remove }
})
