// Is decision support worth having? (objectives fix 3.7) Acceptance rate by kind
// of advice, from the events recorded as people use it. For Admin and Owner.
import { useEffect, useState } from "react";

import { SectionCard } from "@/components/ui/section-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDecisionSupportSummary, type KindSummary } from "./events.api";

const pct = (v: number | null) => (v == null ? "No answers yet" : `${v}%`);

export function UsefulnessCard() {
  const [kinds, setKinds] = useState<KindSummary[] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDecisionSupportSummary()
      .then((d) => {
        if (cancelled) return;
        setKinds(d.kinds);
        setNote(d.note);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load the summary"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SectionCard
      title="Is decision support useful?"
      subtitle="How often the advice shown was accepted rather than dismissed. A person always decides."
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive-strong">
          Couldn't load the summary. {error}
        </p>
      ) : !kinds ? (
        <p className="text-sm text-muted-foreground">Counting…</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Advice</TableHead>
                <TableHead className="text-right">Shown</TableHead>
                <TableHead className="text-right">Accepted</TableHead>
                <TableHead className="text-right">Dismissed</TableHead>
                <TableHead className="text-right">Acceptance rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kinds.map((k) => (
                <TableRow key={k.kind}>
                  <TableCell className="text-sm">{k.label}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{k.shown}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{k.accepted}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{k.dismissed}</TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums">{pct(k.acceptanceRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="pt-2 text-overline text-muted-foreground">
            Acceptance rate is accepted out of accepted plus dismissed. {note}
          </p>
        </>
      )}
    </SectionCard>
  );
}
