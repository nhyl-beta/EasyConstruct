import { useState } from "react";
import { Lock, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/ui/section-card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { EmptyState } from "@/components/refine-ui/views/empty-state";
import { useDocumentTypes } from "@/features/document-types/hooks/use-document-types";
import { documentTypesRepository, type DocumentTypeItem } from "@/features/document-types/repositories/document-types.repository";

type Editing = { mode: "add" } | { mode: "edit"; item: DocumentTypeItem };

export default function AdminDocumentTypesPage() {
  const { groups, types, loading, error, refresh } = useDocumentTypes({ all: true });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const categories = Array.from(new Set(types.map((t) => t.category)));

  const open = (next: Editing) => {
    setEditing(next);
    setName(next.mode === "edit" ? next.item.name : "");
    setCategory(next.mode === "edit" ? next.item.category : "General");
    setFormError(null);
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setFormError(null);
    try {
      if (editing.mode === "add") {
        await documentTypesRepository.create({ name: name.trim(), category: category.trim() || undefined });
        toast.success("Document type added");
      } else {
        const item = editing.item;
        await documentTypesRepository.update(item.id, {
          ...(item.isSystem ? {} : { name: name.trim() }),
          category: category.trim(),
        });
        toast.success("Document type updated");
      }
      setEditing(null);
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save the document type");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item: DocumentTypeItem, active: boolean) => {
    try {
      await documentTypesRepository.update(item.id, { active });
      toast.success(active ? `"${item.name}" is available again` : `"${item.name}" is no longer offered for new documents`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the document type");
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Document types"
        description="The types people can file a document under. A new type shows up in every upload form straight away."
        actions={
          <Button onClick={() => open({ mode: "add" })}>
            <Plus className="h-4 w-4" /> Add type
          </Button>
        }
      />
      <PageContent className="space-y-6 p-6 md:p-8">
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {!loading && error && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-destructive-strong">
            <span>Couldn't load document types. {error}</span>
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        )}
        {!loading && !error && groups.length === 0 && (
          <EmptyState title="No document types yet" description="Add the first type to make it available in the upload forms." />
        )}
        {!loading &&
          !error &&
          groups.map((g) => (
            <SectionCard key={g.category} title={g.category}>
              <ul className="divide-y divide-border">
                {g.types.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                    <span className={`min-w-0 flex-1 text-sm font-medium ${t.active ? "" : "text-muted-foreground line-through"}`}>{t.name}</span>
                    {t.isSystem && (
                      <Badge variant="outline" className="gap-1 rounded-full text-overline" title="Project gates read this type by name, so it can't be renamed or switched off">
                        <Lock className="h-3 w-3" /> System
                      </Badge>
                    )}
                    <Button size="icon" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => open({ mode: "edit", item: t })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={t.active}
                        disabled={t.isSystem}
                        onCheckedChange={(v) => void toggle(t, v)}
                        aria-label={`${t.name} is ${t.active ? "active" : "inactive"}`}
                      />
                      <span className="w-14 text-xs text-muted-foreground">{t.active ? "Active" : "Inactive"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ))}
      </PageContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.mode === "add" ? "Add document type" : "Edit document type"}</DialogTitle>
            <DialogDescription>
              {editing?.mode === "edit" && editing.item.isSystem
                ? "This is a system type: only its category can change."
                : "Documents already filed under a renamed type follow the new name."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="dt-name">Name</Label>
              <Input
                id="dt-name"
                value={name}
                maxLength={50}
                disabled={editing?.mode === "edit" && editing.item.isSystem}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Building Permit"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dt-category">Category</Label>
              <Input id="dt-category" list="dt-categories" value={category} maxLength={50} onChange={(e) => setCategory(e.target.value)} />
              <datalist id="dt-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            {formError && <p className="text-sm text-destructive-strong">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy || name.trim().length < 2 || !category.trim()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

AdminDocumentTypesPage.displayName = "AdminDocumentTypesPage";
