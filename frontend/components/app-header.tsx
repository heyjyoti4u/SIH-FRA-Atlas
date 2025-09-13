"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"

type AppHeaderProps = {
  onToggleSidebar?: () => void
}

export function AppHeader({ onToggleSidebar }: AppHeaderProps) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-background px-4">
      <div className="flex items-center gap-2">
        {onToggleSidebar ? (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="mr-1 inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-2 text-xs shadow-sm hover:bg-accent hover:text-accent-foreground"
            aria-label="Toggle filters sidebar"
          >
            {"≡"}
          </button>
        ) : null}
        <h1 className="text-sm font-medium leading-none text-pretty">
          Forest Rights Act (FRA) Atlas & Decision Support System
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <Avatar className="h-7 w-7" aria-label="User profile">
          <AvatarFallback title="User Profile">UP</AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
