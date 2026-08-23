import { cookies } from "next/headers"
import type { NextResponse } from "next/server"

import type { SessionData } from "@/lib/types"

const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const COOKIE_NAME = "sid"

type GlobalSessions = typeof globalThis & {
  __surgeSessions?: Map<string, SessionData>
}

function getStore(): Map<string, SessionData> {
  const g = globalThis as GlobalSessions
  if (!g.__surgeSessions) {
    g.__surgeSessions = new Map()
  }
  return g.__surgeSessions
}

export function createSession(
  data: Omit<SessionData, "createdAt" | "sites" | "generatedAt">
): string {
  const sid = crypto.randomUUID()
  getStore().set(sid, {
    email: data.email,
    token: data.token,
    createdAt: Date.now(),
    sites: [],
    generatedAt: null,
  })
  return sid
}

export async function getSession(): Promise<(SessionData & { sid: string }) | null> {
  const jar = await cookies()
  const sid = jar.get(COOKIE_NAME)?.value
  if (!sid) return null

  const store = getStore()
  const session = store.get(sid)
  if (!session) return null

  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    store.delete(sid)
    return null
  }

  return { sid, ...session }
}

export function getLiveSession(sid: string): SessionData | null {
  return getStore().get(sid) ?? null
}

export function deleteSession(sid: string): void {
  getStore().delete(sid)
}

export function sessionCookieOptions(maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)) {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  }
}

export function clearSessionCookie(res: NextResponse): void {
  const cookie = sessionCookieOptions(0)
  res.cookies.set(cookie.name, "", { ...cookie, maxAge: 0 })
}
