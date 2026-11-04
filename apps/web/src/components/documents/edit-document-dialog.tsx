import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentTypeSelect } from "@/features/document-types/components/DocumentTypeSelect";
import type { DocumentRecord } from "@/features/documents/repositories/documents.repository";

export interface DocumentEdit {
  title: string;
  type: string;
  version: string;
}

/** Admin's edit of a filed document: its title, type and version. The file itself is not changed. */
export function EditDocumentDialog({
  document,
  saving,
  onClose,
  onSave,
}: {
  document: DocumentRecord | null;
  saving: boolean;
  onClose: () => void;
  onSave: (id: number, edit: DocumentEdit) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (document) {
      setTitle(document.title);
      setType(document.type);
      setVersion(document.version);
    }
  }, [document]);

  const valid = title.trim().length >= 2 && type.trim() !== "" && version.trim() !== "";

  return (
    <Dialog open={document !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
          <DialogDescription>{document?.documentId} · {document?.project}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Title</Label>
            <Input id="doc-title" value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-type">Type</Label>
            <DocumentTypeSelect id="doc-type" value={type} onChange={setType} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-version">Version</Label>
            <Input id="doc-version" value={version} maxLength={10} onChange={(e) => setVersion(e.target.value)} className="w-28" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            disabled={!valid || saving || !document}
            onClick={() => document && void onSave(document.id, { title: title.trim(), type, version: version.trim() })}
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
