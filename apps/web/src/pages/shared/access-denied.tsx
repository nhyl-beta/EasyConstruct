import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";

export default function AccessDeniedPage() {
  const navigate = useNavigate();

  return (
    <PageContainer>
      <PageHeader
        title="Access denied"
        description="You don't have permission to view this page."
      />
      <PageContent className="flex min-h-96 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex items-center justify-center rounded-full bg-destructive/10 p-4">
          <ShieldAlert className="h-6 w-6 text-destructive-strong" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">
            This area is restricted
          </h3>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your account role doesn't include access to this workspace. If
            you believe this is a mistake, contact an administrator.
          </p>
        </div>
        <Button onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
      </PageContent>
    </PageContainer>
  );
}

AccessDeniedPage.displayName = "AccessDeniedPage";
