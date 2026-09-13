export function paginationPages(page: number, maxPage: number, radius = 4): number[] {
  return Array.from({ length: maxPage }, (_, index) => index + 1).filter((value) =>
    value === 1 || value === maxPage || Math.abs(value - page) <= radius,
  )
}
