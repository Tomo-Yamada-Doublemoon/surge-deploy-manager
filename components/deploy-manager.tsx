"use client"

import * as React from "react"
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  LogOutIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SitePreviewLink } from "@/components/site-preview-link"
import { SurgeMark } from "@/components/surge-mark"
import { mergeSiteUpdates, removeSites } from "@/lib/catalog"
import { updateSelection } from "@/lib/selection"
import { sortSites, type SiteSortKey, type SortDir } from "@/lib/sort-sites"
import {
  isSitePending,
  pendingDomains,
  type CatalogPayload,
  type EnrichPayload,
  type Site,
} from "@/lib/types"

type ApiError = Error & { unauthorized?: boolean }
type Status = { message: string; error?: boolean }
type EnrichProgress = { done: number; total: number }

const ENRICH_BATCH = 8
const DELETE_CONFIRM_THRESHOLD = 10
const SUCCESS_STATUS_MS = 4000

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...options,
  })

  const data = (await res.json().catch(() => ({}))) as T & { error?: string }

  if (res.status === 401) {
    const err = new Error(data.error || "ログインが必要です") as ApiError
    err.unauthorized = true
    throw err
  }

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }

  return data
}

function SortableHead({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string
  column: SiteSortKey
  sortKey: SiteSortKey
  sortDir: SortDir
  onSort: (key: SiteSortKey) => void
  className?: string
}) {
  const active = sortKey === column
  const SortIcon = sortDir === "asc" ? ArrowUpIcon : ArrowDownIcon
  return (
    <TableHead className={className}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 h-auto gap-1 px-2 py-1 font-medium"
        onClick={() => onSort(column)}
      >
        {label}
        {active ? <SortIcon className="size-3.5" /> : null}
      </Button>
    </TableHead>
  )
}

export function DeployManager() {
  const [booting, setBooting] = React.useState(true)
  const [authed, setAuthed] = React.useState(false)
  const [account, setAccount] = React.useState("")
  const [generatedAt, setGeneratedAt] = React.useState<string | null>(null)
  const [sites, setSites] = React.useState<Site[]>([])
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [filter, setFilter] = React.useState("")
  const [sortKey, setSortKey] = React.useState<SiteSortKey>("updatedAt")
  const [sortDir, setSortDir] = React.useState<SortDir>("desc")
  const [blocking, setBlocking] = React.useState(false)
  const [blockingText, setBlockingText] = React.useState("処理中…")
  const [enrichProgress, setEnrichProgress] = React.useState<EnrichProgress | null>(
    null
  )
  const [status, setStatus] = React.useState<Status | null>(null)
  const [loginError, setLoginError] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loggingIn, setLoggingIn] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = React.useState("")

  const enrichAbortRef = React.useRef<AbortController | null>(null)

  const q = filter.trim().toLowerCase()
  const filterActive = q.length > 0
  const sorted = sortSites(sites, sortKey, sortDir)
  const filtered = !filterActive
    ? sorted
    : sorted.filter((s) =>
        [s.title, s.domain, s.url].some((v) => (v || "").toLowerCase().includes(q))
      )

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.domain))

  const enriching = enrichProgress !== null
  const busy = blocking || enriching

  function applyCatalog(data: CatalogPayload) {
    const nextSites = data.sites || []
    setSites(nextSites)
    setAccount(data.account || "")
    setGeneratedAt(data.generatedAt)
    setSelected((prev) => {
      const alive = new Set(nextSites.map((s) => s.domain))
      return new Set([...prev].filter((d) => alive.has(d)))
    })
  }

  function clearEnrich() {
    enrichAbortRef.current?.abort()
    enrichAbortRef.current = null
    setEnrichProgress(null)
  }

  function showLogin(msg?: string) {
    clearEnrich()
    setAuthed(false)
    setSites([])
    setSelected(new Set())
    setAccount("")
    setGeneratedAt(null)
    setLoginError(msg || "")
  }

  function handleUnauthorized(e: unknown): boolean {
    const err = e as ApiError
    if (!err.unauthorized) return false
    showLogin(err.message)
    return true
  }

  function handleSort(key: SiteSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      return
    }
    setSortKey(key)
    setSortDir(key === "title" || key === "domain" ? "asc" : "desc")
  }

  async function enrichPending(domains: string[]) {
    enrichAbortRef.current?.abort()
    if (!domains.length) {
      enrichAbortRef.current = null
      setEnrichProgress(null)
      return
    }

    const controller = new AbortController()
    enrichAbortRef.current = controller
    const total = domains.length
    let done = 0
    setEnrichProgress({ done: 0, total })

    try {
      for (let i = 0; i < domains.length; i += ENRICH_BATCH) {
        if (controller.signal.aborted) break
        const batch = domains.slice(i, i + ENRICH_BATCH)
        const data = await api<EnrichPayload>("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domains: batch }),
          signal: controller.signal,
        })
        if (controller.signal.aborted) break
        setSites((prev) => mergeSiteUpdates(prev, data.updates))
        done = Math.min(total, done + batch.length)
        setEnrichProgress({ done, total })
      }

      if (controller.signal.aborted) {
        setStatus({ message: `詳細取得を中断しました（${done} / ${total}）` })
      } else {
        setStatus({
          message: `一覧を更新しました（${domains.length} 件の詳細を取得）`,
        })
      }
    } catch (e) {
      if (controller.signal.aborted) return
      if (!handleUnauthorized(e)) {
        setStatus({
          message: `詳細取得に失敗: ${(e as Error).message}`,
          error: true,
        })
      }
    } finally {
      if (enrichAbortRef.current === controller) {
        enrichAbortRef.current = null
        setEnrichProgress(null)
      }
    }
  }

  function startEnrichOrAnnounce(siteList: Site[], idleMessage: string) {
    const pending = pendingDomains(siteList)
    if (pending.length) void enrichPending(pending)
    else setStatus({ message: idleMessage })
  }

  async function loadCatalogAndEnrich(
    listMessage: string,
    idleMessage: (count: number) => string = (n) => `一覧を取得しました（${n} 件）`
  ) {
    setBlocking(true)
    setBlockingText(listMessage)
    try {
      const data = await api<CatalogPayload>("/api/refresh", { method: "POST" })
      applyCatalog(data)
      const siteList = data.sites || []
      startEnrichOrAnnounce(siteList, idleMessage(siteList.length))
      return data
    } finally {
      setBlocking(false)
    }
  }

  React.useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setBlocking(true)
      setBlockingText("セッション確認中…")
      try {
        const me = await api<CatalogPayload>("/api/me")
        if (cancelled) return
        setAuthed(true)
        if (me.sites?.length) {
          applyCatalog(me)
          const pending = pendingDomains(me.sites)
          setBlocking(false)
          if (pending.length) void enrichPending(pending)
          return
        }

        setStatus({ message: "初回取得中…" })
        await loadCatalogAndEnrich("Surge から一覧を取得中…")
        if (cancelled) return
      } catch (e) {
        if (cancelled) return
        const err = e as ApiError
        showLogin(err.unauthorized ? err.message : undefined)
      } finally {
        if (!cancelled) {
          setBlocking(false)
          setBooting(false)
        }
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
      enrichAbortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, [])

  React.useEffect(() => {
    if (!status || status.error) return
    const timer = window.setTimeout(() => setStatus(null), SUCCESS_STATUS_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError("")
    setLoggingIn(true)
    try {
      await api("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      setPassword("")
      setAuthed(true)
      setStatus({ message: "ログイン成功。一覧を取得しています…" })
      await loadCatalogAndEnrich("Surge から一覧を取得中…")
    } catch (err) {
      if (handleUnauthorized(err)) return
      setLoginError((err as ApiError).message || "ログインに失敗しました")
    } finally {
      setLoggingIn(false)
      setBlocking(false)
    }
  }

  async function handleRefresh() {
    setStatus({ message: "再取得中…" })
    try {
      await loadCatalogAndEnrich(
        "Surge から一覧を取得中…",
        (n) => `一覧を更新しました（${n} 件）`
      )
    } catch (e) {
      if (!handleUnauthorized(e)) {
        setStatus({ message: `再取得に失敗: ${(e as Error).message}`, error: true })
      }
    }
  }

  function cancelEnrich() {
    enrichAbortRef.current?.abort()
  }

  const selectedDomains = [...selected]
  const needsDeleteConfirm = selectedDomains.length > DELETE_CONFIRM_THRESHOLD
  const deleteConfirmOk =
    !needsDeleteConfirm || deleteConfirmText.trim() === String(selectedDomains.length)

  async function handleDelete() {
    if (!selectedDomains.length || !deleteConfirmOk) return

    setDeleteOpen(false)
    setDeleteConfirmText("")
    setBlocking(true)
    setBlockingText("削除中…")
    setStatus({ message: "削除中…" })
    try {
      const data = await api<{
        results: Array<{ ok: boolean; domain: string; message: string }>
      }>("/api/teardown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: selectedDomains }),
      })
      const results = data.results || []
      const failed = results.filter((r) => !r.ok)
      const succeeded = results.filter((r) => r.ok)
      const removed = succeeded.map((r) => r.domain)
      setSelected((prev) => updateSelection(prev, removed, false))
      setSites((prev) => removeSites(prev, removed))
      setStatus({
        message:
          `削除完了: 成功 ${succeeded.length} / 失敗 ${failed.length}` +
          (failed.length
            ? `\n${failed.map((f) => `${f.domain}: ${f.message}`).join("\n")}`
            : ""),
        error: failed.length > 0,
      })
    } catch (e) {
      if (!handleUnauthorized(e)) {
        setStatus({ message: `削除に失敗: ${(e as Error).message}`, error: true })
      }
    } finally {
      setBlocking(false)
    }
  }

  async function handleLogout() {
    enrichAbortRef.current?.abort()
    try {
      await api("/api/logout", { method: "POST" })
    } catch {
      // ignore
    }
    showLogin()
    setStatus(null)
  }

  function toggleDomain(domain: string, checked: boolean) {
    setSelected((prev) => updateSelection(prev, [domain], checked))
  }

  function toggleAll(checked: boolean) {
    setSelected((prev) => updateSelection(prev, filtered.map((s) => s.domain), checked))
  }

  function openDeleteDialog() {
    setDeleteConfirmText("")
    setDeleteOpen(true)
  }

  const accountLine = authed ? `アカウント：${account}` : ""
  const countLine = authed
    ? `総取得件数：${sites.length} · 取得: ${
        generatedAt ? new Date(generatedAt).toLocaleString("ja-JP") : "未取得"
      }`
    : ""

  if (booting) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner />
          <span>セッション確認中…</span>
        </div>
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Surge Deploy Manager</CardTitle>
            <CardDescription>
              Surge アカウントでログインすると、デプロイ一覧を表示します。
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="flex flex-col gap-4">
              {loginError ? (
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertTitle>ログインエラー</AlertTitle>
                  <AlertDescription>{loginError}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">パスワード</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={loggingIn || blocking}
                size="lg"
              >
                {loggingIn ? (
                  <>
                    <Spinner />
                    ログイン中…
                  </>
                ) : (
                  "ログイン"
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    )
  }

  return (
    <div className="relative min-h-svh bg-background" aria-busy={busy || undefined}>
      {blocking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70">
          <div
            className="flex items-center gap-2 text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Spinner />
            <span>{blockingText}</span>
          </div>
        </div>
      ) : null}

      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <SurgeMark />
              <h1 className="font-heading text-2xl font-medium">Surge Deploy Manager</h1>
            </div>
            <p className="text-sm text-muted-foreground">{accountLine}</p>
            <p className="text-sm text-muted-foreground">{countLine}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleRefresh}
              disabled={busy}
            >
              <RefreshCwIcon data-icon="inline-start" />
              一覧を再取得
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={selected.size === 0 || busy}
              onClick={openDeleteDialog}
            >
              <Trash2Icon data-icon="inline-start" />
              {selected.size
                ? `チェックしたものを削除（${selected.size}）`
                : "チェックしたものを削除"}
            </Button>
            <Button type="button" variant="ghost" onClick={handleLogout} disabled={blocking}>
              <LogOutIcon data-icon="inline-start" />
              ログアウト
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-4 p-4 pb-12">
        {enrichProgress ? (
          <Alert>
            <Spinner />
            <AlertTitle>詳細を取得中</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap items-center gap-3">
                <span role="status" aria-live="polite">
                  {enrichProgress.done} / {enrichProgress.total} 件
                </span>
                <Button type="button" variant="outline" size="sm" onClick={cancelEnrich}>
                  キャンセル
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Label className="flex items-center gap-2">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={(checked) => toggleAll(checked === true)}
              aria-label="表示中をすべて選択"
            />
            表示中をすべて選択
          </Label>
          <div className="flex min-w-[200px] flex-1 flex-col gap-1">
            <Label htmlFor="site-filter" className="sr-only">
              絞り込み
            </Label>
            <Input
              id="site-filter"
              type="search"
              placeholder="タイトル・URLで絞り込み"
              aria-label="タイトル・URLで絞り込み"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-sm"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {filtered.length} / {sites.length} 件
          </span>
        </div>

        {status ? (
          <Alert variant={status.error ? "destructive" : "default"}>
            {status.error ? <AlertCircleIcon /> : null}
            <AlertTitle>{status.error ? "エラー" : "ステータス"}</AlertTitle>
            <AlertDescription>
              <pre className="font-sans whitespace-pre-wrap">{status.message}</pre>
            </AlertDescription>
          </Alert>
        ) : null}

        <Card size="sm">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <SortableHead
                    label="タイトル"
                    column="title"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="作成日"
                    column="createdAt"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="hidden md:table-cell"
                  />
                  <SortableHead
                    label="更新日"
                    column="updatedAt"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="hidden md:table-cell"
                  />
                  <SortableHead
                    label="URL"
                    column="domain"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      該当なし
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((site) => {
                    const isSelected = selected.has(site.domain)
                    const pending = isSitePending(site)
                    return (
                      <TableRow
                        key={site.domain}
                        data-state={isSelected ? "selected" : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              toggleDomain(site.domain, checked === true)
                            }
                            aria-label={`${site.domain} を選択`}
                          />
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="flex flex-col gap-0.5">
                            <span className={pending ? "text-muted-foreground" : undefined}>
                              {site.title || "(タイトルなし)"}
                            </span>
                            {site.age ? (
                              <span className="hidden text-muted-foreground md:inline">
                                相対: {site.age}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {site.createdAt || "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {site.updatedAt || "—"}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <SitePreviewLink site={site} />
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) setDeleteConfirmText("")
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedDomains.length} 件を削除しますか？</DialogTitle>
            <DialogDescription>
              Surge から削除します。この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          {filterActive ? (
            <Alert>
              <AlertTitle>絞り込み中です</AlertTitle>
              <AlertDescription>
                「表示中をすべて選択」は、いま表示されている {filtered.length}{" "}
                件だけが対象です（全 {sites.length} 件ではありません）。
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="max-h-48 overflow-auto rounded-lg border bg-muted/30 p-3 text-sm">
            <ul className="flex flex-col gap-1">
              {selectedDomains.slice(0, 10).map((d) => (
                <li key={d}>{d}</li>
              ))}
              {selectedDomains.length > 10 ? (
                <li className="text-muted-foreground">
                  …ほか {selectedDomains.length - 10} 件
                </li>
              ) : null}
            </ul>
          </div>
          {needsDeleteConfirm ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="delete-confirm">
                削除する件数「{selectedDomains.length}」を入力してください
              </Label>
              <Input
                id="delete-confirm"
                inputMode="numeric"
                autoComplete="off"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={String(selectedDomains.length)}
              />
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>キャンセル</DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!deleteConfirmOk}
            >
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
