import type { Site } from "@/lib/types"

export function mergeSiteUpdates(sites: Site[], updates: Site[]): Site[] {
  const byDomain = new Map(updates.map((s) => [s.domain, s]))
  return sites.map((s) => {
    const next = byDomain.get(s.domain)
    if (!next) return s
    return { ...next, age: next.age || s.age }
  })
}

export function removeSites(sites: Site[], domains: Iterable<string>): Site[] {
  const removed = new Set(domains)
  return sites.filter((s) => !removed.has(s.domain))
}
