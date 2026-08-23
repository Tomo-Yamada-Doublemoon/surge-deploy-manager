import { NextResponse } from "next/server"

import {
  clearSessionCookie,
  deleteSession,
  getLiveSession,
  getSession,
} from "@/lib/session"
import { refreshCatalogList } from "@/lib/surge"

export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
  }

  const live = getLiveSession(session.sid)
  if (!live) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
  }

  try {
    const catalog = await refreshCatalogList(session.token, session.email)
    live.sites = catalog.sites
    live.generatedAt = catalog.generatedAt
    return NextResponse.json(catalog)
  } catch (e) {
    const err = e as Error & { status?: number }
    if (err.status === 401) {
      deleteSession(session.sid)
      const res = NextResponse.json({ error: err.message }, { status: 401 })
      clearSessionCookie(res)
      return res
    }
    return NextResponse.json({ error: err.message || "refresh failed" }, { status: 502 })
  }
}
