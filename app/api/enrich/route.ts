import { NextResponse } from "next/server"

import { mergeSiteUpdates } from "@/lib/catalog"
import { isSurgeDomain } from "@/lib/domain"
import {
  clearSessionCookie,
  deleteSession,
  getLiveSession,
  getSession,
} from "@/lib/session"
import { enrichCatalogSites } from "@/lib/surge"

export async function POST(req: Request) {
  const session = await getSession()
  const live = session ? getLiveSession(session.sid) : null
  if (!session || !live) {
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
  if (!safe.length) {
    return NextResponse.json({ error: "valid domains required" }, { status: 400 })
  }

  try {
    const payload = await enrichCatalogSites(session.token, safe)
    live.sites = mergeSiteUpdates(live.sites, payload.updates)
    live.generatedAt = new Date().toISOString()
    return NextResponse.json(payload)
  } catch (e) {
    const err = e as Error & { status?: number }
    if (err.status === 401) {
      deleteSession(session.sid)
      const res = NextResponse.json({ error: err.message }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    return NextResponse.json({ error: err.message || "enrich failed" }, { status: 502 })
  }
}
