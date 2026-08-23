import { mapPool } from "@/lib/pool"
import { messageFrom } from "@/lib/surge-messages"
import {
  SITE_PENDING_STATUS,
  SITE_PENDING_TITLE,
  type CatalogPayload,
  type EnrichPayload,
  type Site,
  type TeardownResult,
} from "@/lib/types"

const SURGE_API = "https://surge.surge.sh"
const SURGE_TIMEOUT_MS = 30_000
const TITLE_TIMEOUT_MS = 12_000
const FETCH_CONCURRENCY = 8

type SurgeResponse = {
  status: number
  body: unknown
}

type MessageBody = {
  messages?: string[]
  token?: string
  email?: string
}

type StatusError = Error & { status: number }

type ListRow = {
  domain: string
  timeAgoInWords?: string
  uploadStartTime?: number
  rev?: number
}

function dayFromMs(n: number): string | null {
  const d = new Date(Number(n))
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function statusError(message: string, status: number): StatusError {
  const err = new Error(message) as StatusError
  err.status = status
  return err
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError"
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function surgeRequest(
  pathname: string,
  {
    method = "GET",
    token,
    email,
    password,
  }: {
    method?: string
    token?: string
    email?: string
    password?: string
  } = {}
): Promise<SurgeResponse> {
  const user = token ? "token" : email
  const pass = token ?? password
  const auth = Buffer.from(`${user}:${pass}`).toString("base64")

  try {
    const res = await fetchWithTimeout(
      `${SURGE_API}${pathname}`,
      {
        method,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          version: "0.27.3",
          "User-Agent": "surge-deploy-manager/2.0",
        },
        cache: "no-store",
      },
      SURGE_TIMEOUT_MS
    )

    const raw = await res.text()
    let body: unknown = null
    try {
      body = raw ? JSON.parse(raw) : null
    } catch {
      body = raw
    }
    return { status: res.status, body }
  } catch (e) {
    if (isAbortError(e)) throw new Error("Surge API timeout")
    throw e
  }
}

export async function loginToSurge(email: string, password: string) {
  const res = await surgeRequest("/token", { method: "POST", email, password })
  const body = res.body as MessageBody | null

  if (res.status === 401) {
    throw statusError(messageFrom(body, "メールまたはパスワードが違います"), 401)
  }

  if (res.status < 200 || res.status >= 300 || !body?.token) {
    throw statusError(
      messageFrom(body, `ログインに失敗しました (${res.status})`),
      res.status || 500
    )
  }

  return { email: body.email || email, token: body.token }
}

async function fetchTitle(domain: string) {
  try {
    const res = await fetchWithTimeout(
      `https://${domain}`,
      {
        headers: { "User-Agent": "surge-deploy-manager/2.0" },
        redirect: "follow",
        cache: "no-store",
      },
      TITLE_TIMEOUT_MS
    )

    const data = (await res.text()).slice(0, 120_000)
    const og =
      data.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
      data.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i)
    const t = data.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = (og?.[1] || t?.[1] || "(タイトルなし)").replace(/\s+/g, " ").trim()
    return { title, status: res.status || 0 }
  } catch (e) {
    if (isAbortError(e)) return { title: "(タイムアウト)", status: 0 }
    return { title: "(取得失敗)", status: 0 }
  }
}

async function fetchRevisionDates(domain: string, token: string) {
  try {
    const res = await surgeRequest(`/${domain}/list`, { token })
    if (res.status !== 200 || !Array.isArray(res.body) || !res.body.length) {
      return { createdAt: null, updatedAt: null }
    }

    const stamps = (res.body as Array<{ rev?: number; uploadStartTime?: number }>)
      .map((r) => Number(r.rev || r.uploadStartTime))
      .filter((n) => Number.isFinite(n) && n > 0)

    if (!stamps.length) return { createdAt: null, updatedAt: null }

    return {
      createdAt: dayFromMs(Math.min(...stamps)),
      updatedAt: dayFromMs(Math.max(...stamps)),
    }
  } catch {
    return { createdAt: null, updatedAt: null }
  }
}

function stubFromRow(row: ListRow): Site {
  const fallbackDay = dayFromMs(row.uploadStartTime || row.rev || 0)
  return {
    domain: row.domain,
    url: `https://${row.domain}`,
    title: SITE_PENDING_TITLE,
    age: row.timeAgoInWords || "",
    createdAt: fallbackDay,
    updatedAt: fallbackDay,
    status: SITE_PENDING_STATUS,
  }
}

async function fetchListRows(token: string): Promise<ListRow[]> {
  const listRes = await surgeRequest("/list", { token })

  if (listRes.status === 401) {
    throw statusError("セッションの有効期限が切れました。再ログインしてください", 401)
  }

  if (listRes.status !== 200 || !Array.isArray(listRes.body)) {
    throw new Error(messageFrom(listRes.body, "一覧の取得に失敗しました"))
  }

  return listRes.body as ListRow[]
}

/** 一覧のみ取得（タイトル解決はしない） */
export async function refreshCatalogList(
  token: string,
  email: string
): Promise<CatalogPayload> {
  const rows = await fetchListRows(token)
  return {
    account: email,
    generatedAt: new Date().toISOString(),
    sites: rows.map(stubFromRow),
  }
}

async function enrichOne(domain: string, token: string, fallback: Site): Promise<Site> {
  const [meta, rev] = await Promise.all([
    fetchTitle(domain),
    fetchRevisionDates(domain, token),
  ])
  return {
    domain,
    url: `https://${domain}`,
    title: meta.title,
    age: fallback.age,
    createdAt: rev.createdAt || fallback.createdAt,
    updatedAt: rev.updatedAt || fallback.updatedAt,
    status: meta.status,
  }
}

function pendingStub(domain: string): Site {
  return {
    domain,
    url: `https://${domain}`,
    title: SITE_PENDING_TITLE,
    age: "",
    createdAt: null,
    updatedAt: null,
    status: SITE_PENDING_STATUS,
  }
}

/** 指定ドメインのタイトル・日付を解決する（サーバは一覧を保持しない） */
export async function enrichCatalogSites(
  token: string,
  domains: string[]
): Promise<EnrichPayload> {
  const targets = [...new Set(domains)]
  const updates = await mapPool(targets, FETCH_CONCURRENCY, async (domain) =>
    enrichOne(domain, token, pendingStub(domain))
  )

  return {
    updates,
    enriched: updates.length,
  }
}

export async function teardownDomain(domain: string, token: string): Promise<TeardownResult> {
  try {
    const res = await surgeRequest(`/${domain}`, { method: "DELETE", token })
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, domain, message: "teardown complete" }
    }
    return {
      ok: false,
      domain,
      message: messageFrom(res.body, `HTTP ${res.status}`),
    }
  } catch (e) {
    return {
      ok: false,
      domain,
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function teardownDomains(
  token: string,
  domains: string[]
): Promise<TeardownResult[]> {
  return mapPool(domains, FETCH_CONCURRENCY, (domain) => teardownDomain(domain, token))
}
