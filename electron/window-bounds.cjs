function isWindowBounds(value) {
  if (!value || typeof value !== 'object') return false
  return ['x', 'y', 'width', 'height'].every((key) =>
    Number.isFinite(value[key]) && Math.abs(value[key]) < 10_000_000,
  ) && value.width >= 100 && value.height >= 100
}

function normalizeWindowBounds(bounds, workArea, minWidth = 980, minHeight = 680) {
  if (!isWindowBounds(bounds) || !isWindowBounds(workArea)) return null
  const width = Math.max(minWidth, Math.min(Math.round(bounds.width), workArea.width))
  const height = Math.max(minHeight, Math.min(Math.round(bounds.height), workArea.height))
  const maxX = workArea.x + Math.max(0, workArea.width - width)
  const maxY = workArea.y + Math.max(0, workArea.height - height)
  return {
    x: Math.round(Math.min(Math.max(bounds.x, workArea.x), maxX)),
    y: Math.round(Math.min(Math.max(bounds.y, workArea.y), maxY)),
    width,
    height,
  }
}

module.exports = { isWindowBounds, normalizeWindowBounds }
