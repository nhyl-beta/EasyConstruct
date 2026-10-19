import { CheckCircle2, FileSignature, ShieldCheck, UserCheck, Wallet, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { useWorkflowTemplates } from "@/features/workflows/hooks/useWorkflows";

const STAGE_ICONS: Record<string, LucideIcon> = {
  UserCheck,
  Wallet,
  ShieldCheck,
  FileSignature,
};

export default function AdminApprovalHierarchyPage() {
  const { templates, loading, error } = useWorkflowTemplates();

  return (
    <PageContainer>
      <PageHeader
        title="Approval hierarchy"
        description="The escalation chain each workflow template follows, from first reviewer to final sign-off."
      />
      <PageContent className="space-y-4 p-6 md:p-8">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && error && (
          <p className="text-sm text-destructive-strong">Couldn't load templates. {error.message}</p>
        )}
        {!loading && !error && templates.length === 0 && (
          <p className="text-sm text-muted-foreground">No workflow templates configured yet.</p>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {t.defaultStages.map((stage, i) => {
                    const Icon = STAGE_ICONS[stage.iconKey] ?? UserCheck;
                    const isLast = i === t.defaultStages.length - 1;
                    return (
                      <div key={stage.role} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/10 text-primary-strong">
                            <Icon className="h-4 w-4" />
                          </div>
                          {!isLast && <div className="w-px flex-1 bg-border" />}
                        </div>
                        <div className={isLast ? "pb-0" : "pb-6"}>
                          <div className="flex items-center gap-2 pt-1.5">
                            <span className="text-sm font-medium">{stage.roleLabel}</span>
                            {isLast && (
                              <Badge variant="outline" className="gap-1 rounded-full border-success/30 text-overline text-success-strong">
                                <CheckCircle2 className="h-3 w-3" /> Final sign-off
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">Stage {i + 1} of {t.defaultStages.length}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageContent>
    </PageContainer>
  );
}

AdminApprovalHierarchyPage.displayName = "AdminApprovalHierarchyPage";
