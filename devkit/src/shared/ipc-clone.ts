/**
 * Electron IPC（invoke / send）使用结构化克隆算法。
 * 不可传递：Proxy、函数、Symbol、多数 class 实例、部分原生对象等。
 * Vue 3 / Pinia 的响应式数据是 Proxy，必须在跨进程前转为纯 JSON 数据。
 */

function ipcJsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'function') return undefined
  if (typeof value === 'symbol') return undefined
  if (typeof value === 'bigint') return value.toString()
  return value
}

export function cloneForIpc<T>(value: T): T {
  if (value === null || value === undefined) {
    return value
  }
  if (typeof value !== 'object') {
    return value
  }
  try {
    return JSON.parse(JSON.stringify(value, ipcJsonReplacer)) as T
  } catch (e) {
    console.error('[cloneForIpc] JSON 序列化失败（可能含循环引用）', e)
    throw e
  }
}

/** 主进程返回给渲染进程前再序列化一层，避免 DB 驱动等返回不可克隆对象。 */
export function toIpcReply<T>(value: T): T {
  if (value === null || value === undefined) {
    return value
  }
  if (typeof value !== 'object') {
    return value
  }
  try {
    return JSON.parse(JSON.stringify(value, ipcJsonReplacer)) as T
  } catch (e) {
    console.error('[toIpcReply] JSON 序列化失败', e)
    throw e
  }
}
