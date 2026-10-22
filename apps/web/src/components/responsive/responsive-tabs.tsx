import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Tab strip that never wraps and never widens the page: it scrolls sideways
 * inside its own box (scrollbar hidden) when the tabs do not fit.
 *
 * Use in place of <TabsList> anywhere a page has more than two tabs.
 */
function ResponsiveTabsList({
  className,
  wrapperClassName,
  ...props
}: React.ComponentProps<typeof TabsList> & { wrapperClassName?: string }) {
  return (
    <div
      data-slot="responsive-tabs-scroller"
      className={cn(
        "max-w-full min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        wrapperClassName,
      )}
    >
      <TabsList
        className={cn("w-max min-w-full justify-start sm:min-w-0", className)}
        {...props}
      />
    </div>
  );
}

function ResponsiveTabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsTrigger>) {
  // flex-none: a trigger keeps its own width instead of being squeezed (the
  // base trigger is flex-1), whitespace-nowrap is already on the base class.
  return (
    <TabsTrigger
      className={cn("min-h-9 flex-none whitespace-nowrap", className)}
      {...props}
    />
  );
}

export {
  Tabs as ResponsiveTabs,
  ResponsiveTabsList,
  ResponsiveTabsTrigger,
  TabsContent as ResponsiveTabsContent,
};
