/** タイトル・リビジョン未取得のプレースホルダ */
export const SITE_PENDING_STATUS = -1
export const SITE_PENDING_TITLE = "(取得中…)"

export type Site = {
  domain: string
  url: string
  title: string
  age: string
  createdAt: string | null
  updatedAt: string | null
  status: number
}

export type SessionData = {
  email: string
  token: string
  createdAt: number
  sites: Site[]
  generatedAt: string | null
}

export type CatalogPayload = {
  account: string
  generatedAt: string | null
  sites: Site[]
}

export type EnrichPayload = {
  updates: Site[]
  enriched: number
}

export type TeardownResult = {
  ok: boolean
  domain: string
  message: string
}

export function isSitePending(site: Site): boolean {
  return site.status === SITE_PENDING_STATUS
}

export function pendingDomains(sites: Site[]): string[] {
  return sites.filter(isSitePending).map((s) => s.domain)
}
