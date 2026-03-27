import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { cloneForIpc } from '@shared/ipc-clone'
import type { ScriptInterpreter } from '@shared/types'
import { useScriptsStore } from './scripts'

export type ActiveRun = {
  executionId: string
  startedAt: number
  pid?: number
  paramSnapshot: Record<string, string>
  sourceContent: string
  interpreter: ScriptInterpreter
}

/** 全局跟踪「每个脚本是否有一条正在跑的子进程」，供列表「结束」与弹窗输出共用 */
export const useScriptRunnerStore = defineStore('scriptRunner', () => {
  const activeByScriptId = ref<Record<string, ActiveRun>>({})
  let detachGlobal: (() => void) | null = null

  const runningScriptIds = computed(() => Object.keys(activeByScriptId.value))

  function attachGlobalListener() {
    if (detachGlobal) return
    detachGlobal = window.api.onScriptOutput((payload) => {
      if (!payload.done) return
      const exId = payload.executionId
      const next = { ...activeByScriptId.value }
      for (const sid of Object.keys(next)) {
        if (next[sid]?.executionId === exId) {
          delete next[sid]
          activeByScriptId.value = next
          break
        }
      }
      void useScriptsStore().refreshList()
    })
  }

  function isRunning(scriptId: string) {
    return !!activeByScriptId.value[scriptId]
  }

  function getRun(scriptId: string): ActiveRun | undefined {
    return activeByScriptId.value[scriptId]
  }

  async function start(
    scriptId: string,
    params: Record<string, string>,
    debug: { content: string; interpreter: ScriptInterpreter }
  ): Promise<{ executionId: string; pid?: number }> {
    attachGlobalListener()
    const existing = activeByScriptId.value[scriptId]
    if (existing) {
      return { executionId: existing.executionId, pid: existing.pid }
    }

    const res = (await window.api.scriptRun(
      scriptId,
      cloneForIpc(params),
      cloneForIpc({ content: debug.content, interpreter: debug.interpreter })
    )) as { executionId: string; pid: number | null }

    const pid = res.pid != null ? res.pid : undefined
    activeByScriptId.value = {
      ...activeByScriptId.value,
      [scriptId]: {
        executionId: res.executionId,
        startedAt: Date.now(),
        pid,
        paramSnapshot: { ...params },
        sourceContent: debug.content,
        interpreter: debug.interpreter
      }
    }
    return { executionId: res.executionId, pid }
  }

  /** 结束指定脚本的当前进程；若本地已无记录则视为已结束 */
  async function stop(scriptId: string): Promise<{ ok: boolean; alreadyEnded: boolean }> {
    const r = activeByScriptId.value[scriptId]
    if (!r) {
      return { ok: false, alreadyEnded: true }
    }
    await window.api.scriptKill(r.executionId)
    const next = { ...activeByScriptId.value }
    delete next[scriptId]
    activeByScriptId.value = next
    return { ok: true, alreadyEnded: false }
  }

  return {
    activeByScriptId,
    runningScriptIds,
    attachGlobalListener,
    isRunning,
    getRun,
    start,
    stop
  }
})
