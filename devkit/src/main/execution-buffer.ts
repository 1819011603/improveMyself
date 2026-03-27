/** 运行中按 executionId 缓存输出，便于弹窗重开时完整回放；进程结束后释放 */
type BufferEntry = { text: string; pid: number | undefined }

const buffers = new Map<string, BufferEntry>()

export function executionBufferInit(id: string, pid: number | undefined): void {
  buffers.set(id, { text: '', pid })
}

export function executionBufferSetPid(id: string, pid: number | undefined): void {
  const b = buffers.get(id)
  if (b) b.pid = pid
}

export function executionBufferAppend(id: string, chunk: string): void {
  const b = buffers.get(id)
  if (b) b.text += chunk
}

export function executionBufferGet(id: string): { output: string; pid: number | undefined } {
  const b = buffers.get(id)
  return { output: b?.text ?? '', pid: b?.pid }
}

export function executionBufferDispose(id: string): void {
  buffers.delete(id)
}
