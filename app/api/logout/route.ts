import { NextResponse } from "next/server"

import { clearSessionCookie, deleteSession, getSession } from "@/lib/session"

export async function POST() {
  const session = await getSession()
  if (session) deleteSession(session.sid)

  const res = NextResponse.json({ ok: true })
  clearSessionCookie(res)
  return res
}
