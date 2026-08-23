import type { Site } from "@/lib/types"

export type SiteSortKey = "updatedAt" | "createdAt" | "title" | "domain"
export type SortDir = "asc" | "desc"

function applyDir(cmp: number, dir: SortDir): number {
  return dir === "asc" ? cmp : -cmp
}

/** null / 空は常に末尾 */
function compareNullableDate(a: string | null, b: string | null, dir: SortDir): number {
  const av = a || ""
  const bv = b || ""
  if (av === bv) return 0
  if (!av) return 1
  if (!bv) return -1
  return applyDir(av < bv ? -1 : 1, dir)
}

function compareText(a: string, b: string, dir: SortDir): number {
  return applyDir(a.localeCompare(b, "ja"), dir)
}

export function sortSites(sites: Site[], key: SiteSortKey, dir: SortDir): Site[] {
  return [...sites].sort((a, b) => {
    switch (key) {
      case "updatedAt":
        return compareNullableDate(a.updatedAt, b.updatedAt, dir)
      case "createdAt":
        return compareNullableDate(a.createdAt, b.createdAt, dir)
      case "title":
        return compareText(a.title || a.domain, b.title || b.domain, dir)
      case "domain":
        return compareText(a.domain, b.domain, dir)
    }
  })
}
