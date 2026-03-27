import type Database from 'better-sqlite3'

/** 未写入设置时的默认单条输出上限（字节） */
export const DEFAULT_EXECUTION_OUTPUT_MAX_BYTES = 1_000_000

function formatLimitLabel(maxBytes: number): string {
  if (maxBytes >= 1048576) return `${(maxBytes / 1048576).toFixed(maxBytes % 1048576 === 0 ? 0 : 1)}MB`
  if (maxBytes >= 1024) return `${Math.round(maxBytes / 1024)}KB`
  return `${maxBytes}B`
}

/** 保留 UTF-8 末尾最多 maxBytes 字节；超长时去掉更早部分 */
export function truncateExecutionOutputUtf8(output: string, maxBytes: number): string {
  const buf = Buffer.from(output, 'utf8')
  if (buf.length <= maxBytes) return output
  const tail = buf.subarray(buf.length - maxBytes)
  let start = 0
  while (start < tail.length && (tail[start] & 0xc0) === 0x80) start++
  const notice = `[DevKit] 输出超过 ${formatLimitLabel(maxBytes)}，已省略更早内容，仅保留末尾。\n`
  return notice + tail.subarray(start).toString('utf8')
}

/** 仅保留最近 maxCount 条「已结束」的执行记录，删除更早的 completed 行 */
export function pruneFinishedExecutionLogs(db: Database.Database, maxCount: number): void {
  const cntRow = db
    .prepare(`SELECT COUNT(*) as c FROM execution_logs WHERE finished_at IS NOT NULL`)
    .get() as { c: number }
  const excess = Math.max(0, cntRow.c - maxCount)
  if (excess <= 0) return

  const oldest = db
    .prepare(
      `
    SELECT id FROM execution_logs
    WHERE finished_at IS NOT NULL
    ORDER BY finished_at ASC
    LIMIT ?
  `
    )
    .all(excess) as { id: string }[]

  const del = db.prepare(`DELETE FROM execution_logs WHERE id = ?`)
  for (const r of oldest) {
    del.run(r.id)
  }
}
