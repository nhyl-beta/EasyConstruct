import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** danger: needs action now. info: unread. read: no dot. */
export type NotificationState = "danger" | "info" | "read";

const dotTone: Record<Exclude<NotificationState, "read">, string> = {
  danger: "bg-destructive",
  info: "bg-info",
};

export interface NotificationCardProps {
  state: NotificationState;
  /** Headline; bold one noun with <strong>. */
  title: ReactNode;
  /** One supporting sentence. */
  body?: ReactNode;
  /** Primary first, quiet second. Omit for informational cards. */
  actions?: ReactNode;
  /** Short and relative: "5 mins ago". */
  time: string;
  /** Optional leading avatar or icon tile. */
  leading?: ReactNode;
  /** Flat sand fill, for cards that address the person directly. */
  tint?: boolean;
  className?: string;
}

export function NotificationCard({
  state,
  title,
  body,
  actions,
  time,
  leading,
  tint,
  className,
}: NotificationCardProps) {
  return (
    <article
      className={cn(
        "relative rounded-lg border border-border p-6 pb-5 shadow-sm",
        tint ? "bg-sand" : "bg-card",
        className,
      )}
    >
      {state !== "read" && (
        <>
          <span
            className={cn("mb-4 block size-2 rounded-full", dotTone[state])}
            aria-hidden="true"
          />
          <span className="sr-only">
            {state === "danger" ? "Needs action" : "Unread"}
          </span>
        </>
      )}
      <div className="flex items-center gap-4">
        {leading}
        <div className="min-w-0">
          <h3 className="text-title font-semibold tracking-[-0.02em]">
            {title}
          </h3>
          {body && (
            <p className="mt-1 text-body text-muted-foreground [&_a]:font-medium [&_a]:text-primary-strong [&_strong]:font-semibold [&_strong]:text-foreground">
              {body}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="mt-5 flex gap-3">{actions}</div>}
      <span className="mt-3 block text-right text-caption text-muted-foreground">
        {time}
      </span>
    </article>
  );
}
