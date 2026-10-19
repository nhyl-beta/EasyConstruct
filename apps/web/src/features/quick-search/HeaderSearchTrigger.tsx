import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoleConfig } from "@/hooks/use-role-config";
import { useQuickSearchControls } from "./context";

const isMac = () => typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

/**
 * The header's search box. Same place and look as before; clicking it,
 * focusing it or typing in it opens the quick-actions palette (typed text is
 * carried over).
 */
export function HeaderSearchBar() {
  const { config } = useRoleConfig();
  const { openPalette, barRef, suppressFocusOpen } = useQuickSearchControls();

  return (
    <div className="relative ml-auto hidden max-w-sm flex-1 md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={barRef}
        type="search"
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={false}
        aria-label="Search or jump to"
        autoComplete="off"
        placeholder={config.searchPlaceholder}
        className="h-9 border-border bg-muted/50 pl-9 pr-14 [&::-webkit-search-cancel-button]:hidden"
        value=""
        onFocus={() => {
          if (suppressFocusOpen.current) {
            suppressFocusOpen.current = false;
            return;
          }
          openPalette("");
        }}
        onClick={() => openPalette("")}
        onChange={(e) => openPalette(e.target.value)}
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 text-overline font-medium text-muted-foreground"
      >
        {isMac() ? "⌘K" : "Ctrl K"}
      </kbd>
    </div>
  );
}

/** Search icon for narrow screens, where the bar is hidden. */
export function HeaderSearchButton({ className }: { className?: string }) {
  const { openPalette } = useQuickSearchControls();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Search or jump to"
      onClick={() => openPalette("")}
    >
      <Search className="h-4 w-4" />
    </Button>
  );
}
