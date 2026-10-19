// apps/web/src/pages/routers/issues-router.tsx — NEW
import { useRoleConfig } from "@/hooks/use-role-config";
import EngineerIssues from "@/pages/roles/engineer/engineer-issues";
import SPIssuesPage from "@/pages/roles/site-personnel/sp-issues";

export default function IssuesRouter() {
  const { identity } = useRoleConfig();
  if (identity.role === "site_personnel") return <SPIssuesPage />;
  return <EngineerIssues />;
}