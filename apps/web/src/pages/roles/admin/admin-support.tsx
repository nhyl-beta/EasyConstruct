import { BarChart2, Mail, Wrench } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";

export default function AdminSupportPage() {
  return (
    <PageContainer>
      <PageHeader
        title="User support"
        description="Where to go for help with accounts, access, and platform issues."
      />
      <PageContent className="space-y-4 p-6 md:p-8">
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-medium">Contact an administrator</h3>
              <p className="text-sm text-muted-foreground">
                For access requests, role changes, or account issues, reach
                the platform team directly.
              </p>
              <a
                href="mailto:admin@easyconstruct.app"
                className="mt-1 inline-block text-sm text-primary-strong underline-offset-2 hover:underline"
              >
                admin@easyconstruct.app
              </a>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link to="/reports">
            <Card className="transition hover:border-primary/40">
              <CardContent className="flex items-center gap-3 p-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <BarChart2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-medium">Reports</h3>
                  <p className="text-xs text-muted-foreground">Organization-wide reporting</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to="/resources">
            <Card className="transition hover:border-primary/40">
              <CardContent className="flex items-center gap-3 p-5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Wrench className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-medium">Resources</h3>
                  <p className="text-xs text-muted-foreground">Shared tools and templates</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </PageContent>
    </PageContainer>
  );
}

AdminSupportPage.displayName = "AdminSupportPage";
