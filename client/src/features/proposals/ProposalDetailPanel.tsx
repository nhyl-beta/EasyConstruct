import type { ReactNode } from "react";

import { DetailPanel } from "@/components/detail-panel/DetailPanel";
import { StatusBadge } from "@/components/ui/status-badge";
import { FEATURES } from "@/config/features";
import { ProposalValidationPanel } from "./components/ProposalValidationPanel";
import type { Proposal } from "./types/proposal.types";

interface ProposalDetailPanelProps {
  proposal: Proposal;
  /** Other proposals in the visible list, for the Related tab. */
  siblings?: Proposal[];
  onSelectRelated?: (proposal: Proposal) => void;
  onClose: () => void;
  inSheet?: boolean;
  /** Role-specific actions (Approve, Request revision, ...), rendered in the sticky footer. Omit for read-only roles. */
  actions?: ReactNode;
  /** Shown on the Content tab, e.g. the submitted files. */
  contentExtra?: ReactNode;
  /** Shown on the Overview tab under the content, e.g. a review comment box. */
  overviewExtra?: ReactNode;
  validationEmptyText?: string;
  onRerunValidation?: () => void;
}

const formatDate = (value: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
};

const formatReviewer = (r: string | null): string => (r ? r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—");

function Card({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/50 py-1.5 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-normal break-words text-right text-sm">{value || "—"}</dd>
    </div>
  );
}

/** One proposal in full. Built once and used by every proposal page. */
export function ProposalDetailPanel({
  proposal: p,
  siblings = [],
  onSelectRelated,
  onClose,
  inSheet,
  actions,
  contentExtra,
  overviewExtra,
  validationEmptyText,
  onRerunValidation,
}: ProposalDetailPanelProps) {
  const related = siblings.filter((s) => s.id !== p.id && s.projectCode === p.projectCode);

  const validation = FEATURES.ai ? (
    <Card title="Rule-based Validation">
      <ProposalValidationPanel raw={p.aiValidation} emptyText={validationEmptyText} onRerun={onRerunValidation} />
    </Card>
  ) : null;

  const content = p.content ? (
    <p className="whitespace-pre-wrap break-words text-sm leading-6">{p.content}</p>
  ) : (
    <p className="text-sm text-muted-foreground">No proposal description was provided.</p>
  );

  const history = [
    { at: p.createdAt, label: "Submitted", detail: p.submittedBy },
    ...(p.reviewedAt ? [{ at: p.reviewedAt, label: p.status, detail: [p.reviewerName, p.reviewComment].filter(Boolean).join(": ") }] : []),
    ...(p.updatedAt && p.updatedAt !== p.createdAt && p.updatedAt !== p.reviewedAt ? [{ at: p.updatedAt, label: "Last updated", detail: "" }] : []),
  ];

  return (
    <DetailPanel
      title={p.title}
      subtitle={`${p.proposalId} · ${p.projectCode}`}
      badge={<StatusBadge status={p.status} />}
      onClose={onClose}
      hideCloseButton={inSheet}
      footer={actions}
      tabs={[
        {
          value: "overview",
          label: "Overview",
          content: (
            <>
              <Card title="Basic Information">
                <dl>
                  <Row label="Submitted by" value={p.submittedBy} />
                  <Row label="Assigned reviewer" value={formatReviewer(p.assignedReviewer)} />
                  <Row label="Submitted at" value={formatDate(p.createdAt)} />
                  <Row label="Amount" value={p.amount} />
                  <Row label="Reviewed by" value={p.reviewerName} />
                  <Row label="Reviewed at" value={formatDate(p.reviewedAt)} />
                </dl>
              </Card>
              <Card title="Proposal Content">{content}</Card>
              {p.reviewComment && (
                <Card title="Review comment">
                  <p className="whitespace-pre-wrap break-words text-sm">{p.reviewComment}</p>
                </Card>
              )}
              {validation}
              {overviewExtra}
            </>
          ),
        },
        {
          value: "content",
          label: "Content",
          content: (
            <>
              <Card title="Proposal Content">{content}</Card>
              {contentExtra}
            </>
          ),
        },
        {
          value: "validation",
          label: "Validation",
          content: validation ?? <p className="text-sm text-muted-foreground">Rule-based validation is switched off.</p>,
        },
        {
          value: "history",
          label: "History",
          content: (
            <ol className="space-y-3">
              {history.map((h, i) => (
                <li key={i} className="rounded-xl border border-border bg-background p-3">
                  <p className="text-sm font-medium">{h.label}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(h.at)}</p>
                  {h.detail && <p className="mt-1 whitespace-pre-wrap break-words text-sm">{h.detail}</p>}
                </li>
              ))}
            </ol>
          ),
        },
        {
          value: "related",
          label: "Related",
          content: (
            <>
              <Card title="Project">
                <p className="font-mono text-sm">{p.projectCode}</p>
                {p.workflowId != null && <p className="text-xs text-muted-foreground">Approval workflow #{p.workflowId}</p>}
              </Card>
              <Card title="Other proposals on this project">
                {related.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None in this list.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {related.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 py-2 text-left hover:bg-muted/40 disabled:cursor-default"
                          disabled={!onSelectRelated}
                          onClick={() => onSelectRelated?.(r)}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm">{r.title}</span>
                            <span className="block font-mono text-overline text-muted-foreground">{r.proposalId}</span>
                          </span>
                          <StatusBadge status={r.status} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          ),
        },
      ]}
    />
  );
}
