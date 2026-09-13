import { describe, expect, it } from 'vitest'
// @ts-expect-error CommonJS module used by the Electron main process.
import windowBounds from '../../electron/window-bounds.cjs'

const { isWindowBounds, normalizeWindowBounds } = windowBounds

describe('window bounds persistence', () => {
  const workArea = { x: 0, y: 25, width: 1728, height: 1080 }

  it('restores a valid position and size', () => {
    expect(normalizeWindowBounds({ x: 120, y: 80, width: 1300, height: 800 }, workArea))
      .toEqual({ x: 120, y: 80, width: 1300, height: 800 })
  })

  it('keeps the restored window within the current display', () => {
    expect(normalizeWindowBounds({ x: 1600, y: 1000, width: 1200, height: 900 }, workArea))
      .toEqual({ x: 528, y: 205, width: 1200, height: 900 })
  })

  it('rejects invalid persisted values', () => {
    expect(isWindowBounds({ x: 0, y: 0, width: 0, height: 0 })).toBe(false)
    expect(normalizeWindowBounds(null, workArea)).toBeNull()
  })
})
