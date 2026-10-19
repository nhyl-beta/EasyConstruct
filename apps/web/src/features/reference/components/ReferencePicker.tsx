// A client or vendor dropdown with "Add new" (objectives fix 1.2). Picking from
// the shared list keeps one spelling per company; adding a name that already
// exists, or looks like one that does, is stopped with the matches so the person
// can use the existing record instead.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { errorBody, errorCode } from "@/lib/api-error";
import { referenceRepository, type ReferenceItem, type ReferenceKind } from "../repositories/reference.repository";

const ADD_NEW = "__add_new__";

const LABEL: Record<ReferenceKind, string> = { clients: "client", vendors: "vendor" };

export function ReferencePicker({
  kind,
  value,
  onChange,
  canAdd = true,
  placeholder,
  invalid,
  id,
  className,
}: {
  kind: ReferenceKind;
  /** The selected name (the form keeps the text; the id is passed along when known). */
  value: string;
  onChange: (name: string, id?: number) => void;
  /** Whether this person's role may add a new one (the server also checks). */
  canAdd?: boolean;
  placeholder?: string;
  invalid?: boolean;
  id?: string;
  className?: string;
}) {
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [similar, setSimilar] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await referenceRepository.list(kind));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load the list");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const options = useMemo(() => {
    const base = items.map((i) => ({ value: String(i.id), label: i.name }));
    // A value typed before this list existed is still shown until the person picks from it.
    if (value && !items.some((i) => i.name === value)) base.unshift({ value: `text:${value}`, label: value });
    return canAdd ? [...base, { value: ADD_NEW, label: `Add new ${LABEL[kind]}…` }] : base;
  }, [items, value, canAdd, kind]);

  const selected = items.find((i) => i.name === value);

  const pick = (v: string) => {
    if (v === ADD_NEW) {
      setAdding(true);
      return;
    }
    if (v.startsWith("text:")) return;
    const item = items.find((i) => String(i.id) === v);
    if (item) onChange(item.name, item.id);
  };

  const submit = async (confirmSimilar = false) => {
    setBusy(true);
    setMessage(null);
    try {
      const created = await referenceRepository.create(kind, draft.trim(), confirmSimilar);
      await load();
      onChange(created.name, created.id);
      setAdding(false);
      setDraft("");
      setSimilar(null);
    } catch (e) {
      const code = errorCode(e);
      const body = errorBody(e);
      if (code === "DUPLICATE_NAME" && body?.existing) {
        // The same company is already there: use it rather than adding another.
        await load();
        onChange(body.existing.name, body.existing.id);
        setAdding(false);
        setDraft("");
        setSimilar(null);
        setMessage(`"${body.existing.name}" already exists, so it was selected.`);
      } else if (code === "SIMILAR_NAME") {
        setSimilar((body?.matches ?? []).map((m) => m.name));
      } else {
        setMessage(e instanceof Error ? e.message : `Couldn't add the ${LABEL[kind]}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <SearchableSelect
        id={id}
        className={className}
        options={options}
        value={selected ? String(selected.id) : value ? `text:${value}` : undefined}
        onValueChange={pick}
        loading={loading}
        invalid={invalid}
        placeholder={placeholder ?? `Select a ${LABEL[kind]}`}
        searchPlaceholder={`Search ${kind}…`}
        emptyText={`No ${kind} yet`}
        sort="none"
      />
      {loadError && <p className="text-xs text-destructive-strong">Couldn't load {kind}. {loadError}</p>}
      {adding && (
        <div className="space-y-2 rounded-md border border-border/60 p-2">
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSimilar(null);
                setMessage(null);
              }}
              placeholder={`New ${LABEL[kind]} name`}
              className="h-8"
              autoFocus
            />
            <Button type="button" size="sm" disabled={busy || draft.trim().length < 2} onClick={() => void submit(false)}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setSimilar(null); }}>
              Cancel
            </Button>
          </div>
          {similar && (
            <div className="space-y-1 text-xs text-warning-strong">
              <p>Similar {kind} already exist: {similar.join(", ")}. Pick one from the list, or add this one anyway.</p>
              <Button type="button" size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => void submit(true)}>
                Add anyway
              </Button>
            </div>
          )}
        </div>
      )}
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
