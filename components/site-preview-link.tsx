"use client"

import * as React from "react"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Spinner } from "@/components/ui/spinner"
import type { Site } from "@/lib/types"

type SitePreviewLinkProps = {
  site: Site
}

export function SitePreviewLink({ site }: SitePreviewLinkProps) {
  const [open, setOpen] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)

  function closePreview() {
    setOpen(false)
    setLoaded(false)
  }

  return (
    <HoverCard
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true)
        else closePreview()
      }}
    >
      <HoverCardTrigger
        href={site.url}
        target="_blank"
        rel="noopener noreferrer"
        delay={400}
        closeDelay={150}
        className="text-foreground underline underline-offset-3 hover:text-muted-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          const next = e.relatedTarget
          if (next instanceof Node && e.currentTarget.contains(next)) return
          closePreview()
        }}
      >
        {site.domain}
      </HoverCardTrigger>
      <HoverCardContent
        side="left"
        align="start"
        sideOffset={8}
        className="w-80 overflow-hidden p-0"
      >
        <div className="relative h-50 overflow-hidden bg-muted">
          {!loaded ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-muted-foreground">
              <Spinner />
              <span>読み込み中…</span>
            </div>
          ) : null}
          {open ? (
            <iframe
              src={site.url}
              title={`${site.title || site.domain} のプレビュー`}
              className="pointer-events-none absolute top-0 left-0 h-[800px] w-[1280px] origin-top-left scale-25 border-0 bg-background"
              loading="lazy"
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5 border-t p-2.5">
          <p className="truncate">{site.title || "(タイトルなし)"}</p>
          <p className="truncate text-muted-foreground">{site.domain}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
