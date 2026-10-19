// apps/web/src/pages/routers/documents-router.tsx — NEW
import { useRoleConfig } from "@/hooks/use-role-config";
import PMDocuments from "@/pages/roles/project-manager/pm-documents";
import SPDocumentsPage from "@/pages/roles/site-personnel/sp-documents";

export default function DocumentsRouter() {
  const { identity } = useRoleConfig();
  if (identity.role === "site_personnel") return <SPDocumentsPage />;
  return <PMDocuments />;
}