const fs = require('node:fs/promises')
const path = require('node:path')

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_KEEP_FILES = 3
const SENSITIVE_KEY = /(authorization|cookie|token|appkey|api[-_]?key|password|secret|requestBody|body)/i

function createLogger({ filePath, maxBytes = DEFAULT_MAX_BYTES, keepFiles = DEFAULT_KEEP_FILES }) {
  let queue = Promise.resolve()

  function write(level, event, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      event: String(event).slice(0, 160),
      ...sanitize(details),
    }
    const line = `${JSON.stringify(entry)}\n`
    queue = queue.then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await rotateIfNeeded(Buffer.byteLength(line))
      await fs.appendFile(filePath, line, 'utf8')
    }).catch((error) => {
      console.error('Failed to write application log:', error)
    })
    return queue
  }

  async function rotateIfNeeded(incomingBytes) {
    let size = 0
    try { size = (await fs.stat(filePath)).size } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error
    }
    if (size + incomingBytes <= maxBytes) return
    for (let index = keepFiles - 1; index >= 1; index -= 1) {
      const source = index === 1 ? filePath : `${filePath}.${index - 1}`
      const target = `${filePath}.${index}`
      try {
        await fs.rm(target, { force: true })
        await fs.rename(source, target)
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error
      }
    }
  }

  return {
    filePath,
    debug: (event, details) => write('debug', event, details),
    info: (event, details) => write('info', event, details),
    warn: (event, details) => write('warn', event, details),
    error: (event, error, details = {}) => write('error', event, {
      ...details,
      error: serializeError(error),
    }),
    flush: () => queue,
  }
}

function sanitize(value, seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.slice(0, 4000)
  if (typeof value !== 'object') return String(value).slice(0, 4000)
  if (seen.has(value)) return '[Circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, seen))
  const result = {}
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitize(child, seen)
  }
  return result
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: String(error.message).slice(0, 4000),
      stack: String(error.stack || '').slice(0, 12000),
      ...(typeof error.status === 'number' ? { status: error.status } : {}),
    }
  }
  return { name: 'UnknownError', message: String(error).slice(0, 4000) }
}

module.exports = { createLogger, sanitize, serializeError }
