/** Surge デプロイのドメイン形式（teardown 許可リスト用） */
export const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*\.surge\.sh$/

export function isSurgeDomain(value: unknown): value is string {
  return typeof value === "string" && DOMAIN_RE.test(value)
}
