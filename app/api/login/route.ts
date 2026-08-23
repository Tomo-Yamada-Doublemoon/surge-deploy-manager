import { NextResponse } from "next/server"

import { createSession, sessionCookieOptions } from "@/lib/session"
import { loginToSurge } from "@/lib/surge"

export async function POST(req: Request) {
  let email = ""
  let password = ""

  try {
    const body = await req.json()
    email = String(body.email || "").trim()
    password = String(body.password || "")
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  if (!email || !password) {
    return NextResponse.json({ error: "メールとパスワードを入力してください" }, { status: 400 })
  }

  try {
    const creds = await loginToSurge(email, password)
    const sid = createSession({ email: creds.email, token: creds.token })
    const res = NextResponse.json({ account: creds.email })
    const cookie = sessionCookieOptions()
    res.cookies.set(cookie.name, sid, cookie)
    return res
  } catch (e) {
    const err = e as Error & { status?: number }
    return NextResponse.json(
      { error: err.message || "ログイン失敗" },
      { status: err.status === 401 ? 401 : 502 }
    )
  }
}
