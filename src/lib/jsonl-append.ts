import { appendFileSync, closeSync, fstatSync, openSync, readSync } from 'node:fs'

function needsLineSeparator(filePath: string): boolean {
  let fd: number | undefined
  try {
    fd = openSync(filePath, 'r')
    const size = fstatSync(fd).size
    if (size === 0) return false

    const lastByte = Buffer.allocUnsafe(1)
    if (readSync(fd, lastByte, 0, 1, size - 1) !== 1) {
      throw new Error(`JSONL tail could not be read: ${filePath}`)
    }
    // Readers split on LF or CRLF. A lone CR is not a complete line boundary,
    // so append LF first and turn it into CRLF before writing the next record.
    return lastByte[0] !== 0x0a
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * A crash can leave a partial JSONL tail without a newline. Put the separator and
 * the new record in one append so the valid record remains independently readable.
 */
export function appendJsonlLine(filePath: string, value: unknown): void {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) throw new TypeError('JSONL value is not serializable')
  const prefix = needsLineSeparator(filePath) ? '\n' : ''
  appendFileSync(filePath, `${prefix}${serialized}\n`, 'utf-8')
}
