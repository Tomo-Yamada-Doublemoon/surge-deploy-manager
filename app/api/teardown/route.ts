import { NextResponse } from "next/server"

import { removeSites } from "@/lib/catalog"
import { isSurgeDomain } from "@/lib/domain"
import { getLiveSession, getSession } from "@/lib/session"
import { teardownDomains } from "@/lib/surge"

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
  }

  let domains: unknown
  try {
    const body = await req.json()
    domains = body.domains
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  if (!Array.isArray(domains) || !domains.length) {
    return NextResponse.json({ error: "domains required" }, { status: 400 })
  }

  const safe = domains.filter(isSurgeDomain)
  const results = await teardownDomains(session.token, safe)
  const removed = results.filter((r) => r.ok).map((r) => r.domain)
  const live = getLiveSession(session.sid)
  const now = new Date().toISOString()

  if (live) {
    live.sites = removeSites(live.sites, removed)
    live.generatedAt = now
  }

  return NextResponse.json({
    results,
    account: session.email,
    generatedAt: live?.generatedAt ?? now,
    sites: live?.sites ?? [],
  })
}
