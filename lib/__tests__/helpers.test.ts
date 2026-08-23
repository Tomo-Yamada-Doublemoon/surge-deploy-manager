import { describe, expect, it } from "vitest"

import { mergeSiteUpdates, removeSites } from "@/lib/catalog"
import { DOMAIN_RE, isSurgeDomain } from "@/lib/domain"
import { mapPool } from "@/lib/pool"
import { updateSelection } from "@/lib/selection"
import { sortSites } from "@/lib/sort-sites"
import { messageFrom } from "@/lib/surge-messages"
import type { Site } from "@/lib/types"
import { SITE_PENDING_STATUS } from "@/lib/types"

function site(partial: Partial<Site> & Pick<Site, "domain">): Site {
  return {
    url: `https://${partial.domain}`,
    title: partial.title ?? partial.domain,
    age: partial.age ?? "",
    createdAt: partial.createdAt ?? null,
    updatedAt: partial.updatedAt ?? null,
    status: partial.status ?? 200,
    ...partial,
  }
}

describe("DOMAIN_RE / isSurgeDomain", () => {
  it("accepts surge.sh domains", () => {
    expect(isSurgeDomain("foo.surge.sh")).toBe(true)
    expect(isSurgeDomain("a-b.12.surge.sh")).toBe(true)
    expect(DOMAIN_RE.test("my-diagram.surge.sh")).toBe(true)
  })

  it("rejects unsafe values", () => {
    expect(isSurgeDomain("example.com")).toBe(false)
    expect(isSurgeDomain("../evil.surge.sh")).toBe(false)
    expect(isSurgeDomain("FOO.surge.sh")).toBe(false)
    expect(isSurgeDomain("")).toBe(false)
    expect(isSurgeDomain(null)).toBe(false)
  })
})

describe("updateSelection", () => {
  it("adds and removes domains", () => {
    const start = new Set(["a.surge.sh"])
    const added = updateSelection(start, ["b.surge.sh", "c.surge.sh"], true)
    expect([...added].sort()).toEqual(["a.surge.sh", "b.surge.sh", "c.surge.sh"])

    const removed = updateSelection(added, ["a.surge.sh", "c.surge.sh"], false)
    expect([...removed]).toEqual(["b.surge.sh"])
  })

  it("does not mutate the previous set", () => {
    const start = new Set(["a.surge.sh"])
    updateSelection(start, ["b.surge.sh"], true)
    expect([...start]).toEqual(["a.surge.sh"])
  })
})

describe("messageFrom", () => {
  it("joins Surge messages when present", () => {
    expect(messageFrom({ messages: ["one", "two"] }, "fallback")).toBe("one, two")
  })

  it("falls back when messages are missing", () => {
    expect(messageFrom(null, "fallback")).toBe("fallback")
    expect(messageFrom({}, "fallback")).toBe("fallback")
  })
})

describe("sortSites", () => {
  const rows = [
    site({ domain: "a.surge.sh", title: "Beta", updatedAt: "2024-01-01", status: SITE_PENDING_STATUS }),
    site({ domain: "b.surge.sh", title: "Alpha", updatedAt: "2025-01-01" }),
    site({ domain: "c.surge.sh", title: "Gamma", updatedAt: null }),
  ]

  it("sorts by updatedAt descending by default use-case", () => {
    const sorted = sortSites(rows, "updatedAt", "desc")
    expect(sorted.map((s) => s.domain)).toEqual([
      "b.surge.sh",
      "a.surge.sh",
      "c.surge.sh",
    ])
  })

  it("sorts by title ascending", () => {
    const sorted = sortSites(rows, "title", "asc")
    expect(sorted.map((s) => s.title)).toEqual(["Alpha", "Beta", "Gamma"])
  })
})

describe("mergeSiteUpdates / removeSites", () => {
  it("merges title and keeps previous age when update age is empty", () => {
    const current = [site({ domain: "a.surge.sh", title: "(取得中…)", age: "2 days ago" })]
    const merged = mergeSiteUpdates(current, [
      site({ domain: "a.surge.sh", title: "Diagram", age: "" }),
    ])
    expect(merged[0]?.title).toBe("Diagram")
    expect(merged[0]?.age).toBe("2 days ago")
  })

  it("removes succeeded domains only", () => {
    const current = [
      site({ domain: "a.surge.sh" }),
      site({ domain: "b.surge.sh" }),
    ]
    expect(removeSites(current, ["a.surge.sh"]).map((s) => s.domain)).toEqual([
      "b.surge.sh",
    ])
  })
})

describe("mapPool", () => {
  it("keeps input order with limited concurrency", async () => {
    const result = await mapPool([3, 2, 1], 2, async (n) => {
      await new Promise((resolve) => setTimeout(resolve, n * 5))
      return n * 10
    })
    expect(result).toEqual([30, 20, 10])
  })
})
