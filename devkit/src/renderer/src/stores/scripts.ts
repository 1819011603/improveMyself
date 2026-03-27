import { defineStore } from 'pinia'
import { ref } from 'vue'
import { cloneForIpc } from '@shared/ipc-clone'
import type { Script } from '@shared/types'

export const useScriptsStore = defineStore('scripts', () => {
  const list = ref<Script[]>([])
  const loading = ref(false)
  /** 最近一次列表查询条件，供执行结束后静默刷新且不打断当前筛选 */
  const listFetchParams = ref<{ search?: string; tags?: string[] }>({})

  async function fetchList(opts?: { search?: string; tags?: string[] }) {
    if (opts !== undefined) {
      listFetchParams.value = { ...opts }
    }
    loading.value = true
    try {
      list.value = await window.api.scriptList(cloneForIpc(listFetchParams.value))
    } finally {
      loading.value = false
    }
  }

  /** 执行结束后更新「上次执行 / 已运行时间」等统计，不显示全表 loading */
  async function refreshList() {
    try {
      list.value = await window.api.scriptList(cloneForIpc(listFetchParams.value))
    } catch {
      /* 保留旧列表 */
    }
  }

  async function create(data: Omit<Script, 'id' | 'createdAt' | 'updatedAt'>) {
    const script = await window.api.scriptCreate(cloneForIpc(data))
    list.value.unshift(script)
    return script
  }

  async function update(id: string, data: Partial<Script>) {
    const script = await window.api.scriptUpdate(id, cloneForIpc(data))
    const idx = list.value.findIndex((s) => s.id === id)
    if (idx !== -1) list.value[idx] = script
    return script
  }

  async function remove(id: string) {
    await window.api.scriptDelete(id)
    list.value = list.value.filter((s) => s.id !== id)
  }

  const SCRIPT_NAME_MAX = 64
  const DUPLICATE_SUFFIX = '_copy'

  /** 复制为新脚本：名称 `原名_copy`（总长不超过 64 字），其余字段相同 */
  async function duplicate(script: Script) {
    const maxBase = Math.max(0, SCRIPT_NAME_MAX - DUPLICATE_SUFFIX.length)
    const base = script.name.slice(0, maxBase)
    const payload: Omit<Script, 'id' | 'createdAt' | 'updatedAt'> = {
      name: `${base}${DUPLICATE_SUFFIX}`,
      description: script.description,
      tags: [...script.tags],
      platforms: JSON.parse(JSON.stringify(script.platforms)),
      params: JSON.parse(JSON.stringify(script.params))
    }
    return create(payload)
  }

  return { list, loading, fetchList, refreshList, create, update, remove, duplicate }
})
