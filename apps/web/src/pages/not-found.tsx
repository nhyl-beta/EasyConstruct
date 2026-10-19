import { Link, useLocation } from "react-router";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";

// Without a catch-all, React Router matches nothing and renders an empty
// document — indistinguishable from a crash when a link is wrong or a URL is
// mistyped. This gives that case a readable page and a way back.
export default function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <PageContainer>
      <PageContent className="p-6 md:p-8">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
          <Compass className="h-10 w-10 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">Page not found</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing is routed to{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                {pathname}
              </code>
              .
            </p>
          </div>
          <Button asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </PageContent>
    </PageContainer>
  );
}
