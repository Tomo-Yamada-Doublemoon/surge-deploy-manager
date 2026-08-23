import { NextResponse } from "next/server"

import { getSession } from "@/lib/session"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
  }

  return NextResponse.json({
    account: session.email,
    generatedAt: session.generatedAt,
    sites: session.sites,
  })
}
