// A document type dropdown grouped by category, loaded from the API (client demo change #1).
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDocumentTypes } from "../hooks/use-document-types";

export function DocumentTypeSelect({
  value,
  onChange,
  categories,
  id,
  className,
}: {
  value: string;
  onChange: (name: string) => void;
  /** Only show these categories (for example Site Personnel see "Field"). */
  categories?: string[];
  id?: string;
  className?: string;
}) {
  const { groups, loading, error } = useDocumentTypes({ categories });

  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={onChange} disabled={loading || groups.length === 0}>
        <SelectTrigger id={id} className={className ?? "w-full"}>
          <SelectValue placeholder={loading ? "Loading types…" : "Select a document type"} />
        </SelectTrigger>
        <SelectContent>
          {groups.map((g) => (
            <SelectGroup key={g.category}>
              <SelectLabel>{g.category}</SelectLabel>
              {g.types.map((t) => (
                <SelectItem key={t.id} value={t.name}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-destructive-strong">Couldn't load document types. {error}</p>}
      {!loading && !error && groups.length === 0 && <p className="text-xs text-muted-foreground">No document types available.</p>}
    </div>
  );
}
