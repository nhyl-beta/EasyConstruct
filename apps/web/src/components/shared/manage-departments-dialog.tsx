// HR adds and removes department categories. A department that still has employees is refused by the server.
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDepartments } from "@/features/employees/hooks/use-departments";

export function ManageDepartmentsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { departments, add, remove } = useDepartments();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the change");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage departments</DialogTitle>
          <DialogDescription>These are the choices on the employee form and the filter. A department with employees cannot be removed.</DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length < 2) return;
            void run(async () => { await add(name); setName(""); }, "Department added");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New department name" maxLength={100} />
          <Button type="submit" disabled={busy || name.trim().length < 2}>Add</Button>
        </form>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {departments.map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
              {d.name}
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={busy} aria-label={`Remove ${d.name}`} onClick={() => void run(() => remove(d.id), "Department removed")}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
