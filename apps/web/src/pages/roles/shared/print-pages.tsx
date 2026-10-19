// Printable forms laid out like the client's paper RFI / RFA and transmittal
// sheets. The browser's "Save as PDF" in the print dialog produces the PDF.
// These routes sit outside the app Layout so no sidebar/header is printed.
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { COMPANY } from "@/features/requests/lib/company";
import { useRequestDetail } from "@/features/requests/hooks/useRequests";
import { TransmittalRepository } from "@/features/requests/repositories/request.repository";
import {
  DISCIPLINE_LABEL,
  TRANSMITTAL_PURPOSES,
  type DesignRequestDetail,
  type Impact,
  type Transmittal,
} from "@/features/requests/types/request.types";
import { ProjectRepository } from "@/features/projects/repositories/project.repository";

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";

const PRINT_CSS = `
  @page { size: A4; margin: 14mm; }
  body { background: #fff; }
  .sheet { max-width: 190mm; margin: 0 auto; padding: 8mm; color: #111; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; }
  .sheet table { width: 100%; border-collapse: collapse; }
  .sheet td, .sheet th { border: 1px solid #222; padding: 4px 6px; vertical-align: top; text-align: left; }
  .sheet th { background: #f1f1f1; font-weight: 600; width: 22%; }
  .sheet h1 { font-size: 15px; letter-spacing: .04em; margin: 0; }
  .sheet .letterhead { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }
  .sheet .box { border: 1px solid #222; padding: 6px 8px; min-height: 70px; white-space: pre-wrap; }
  .sheet .sig { height: 38px; border-bottom: 1px solid #222; }
  .sheet .stamp { border: 2px dashed #666; min-height: 64px; padding: 6px; text-align: center; color: #444; }
  .sheet .cb { display: inline-block; width: 11px; height: 11px; border: 1px solid #111; margin-right: 4px; vertical-align: -1px; text-align: center; line-height: 10px; font-size: 10px; }
  .sheet .gap { height: 8px; }
  @media print { .no-print { display: none !important; } .sheet { padding: 0; } }
`;

const Check = ({ on, label }: { on: boolean; label: string }) => (
  <span style={{ marginRight: 14 }}>
    <span className="cb">{on ? "✓" : ""}</span>
    {label}
  </span>
);

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className="no-print" style={{ textAlign: "center", padding: 12 }}>
        <Button onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>
      <div className="sheet">
        <div className="letterhead">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{COMPANY.name}</div>
            <div style={{ color: "#444" }}>{COMPANY.line}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h1>{title}</h1>
            {subtitle && <div style={{ color: "#444" }}>{subtitle}</div>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

const impactRow = (name: string, value: Impact, extra: string | null) => (
  <tr>
    <th>{name}</th>
    <td colSpan={3}>
      <Check on={value === "none"} label="None" />
      <Check on={value === "increase"} label="Increase" />
      <Check on={value === "decrease"} label="Decrease" />
      {extra}
    </td>
  </tr>
);

function RequestForm({ r, project }: { r: DesignRequestDetail; project: { name: string; location: string | null } | null }) {
  const isRfa = r.kind === "RFA";
  const reqFiles = r.files.filter((f) => f.stage === "request");
  const resFiles = r.files.filter((f) => f.stage === "response");
  return (
    <Shell title={isRfa ? "REQUEST FOR APPROVAL" : "REQUEST FOR INFORMATION"} subtitle={`${r.kind} · ${DISCIPLINE_LABEL[r.discipline]}`}>
      <table>
        <tbody>
          <tr>
            <th>Project name</th>
            <td>{project?.name ?? r.projectCode}</td>
            <th>Request no.</th>
            <td style={{ fontWeight: 700 }}>{r.number}</td>
          </tr>
          <tr>
            <th>Project location</th>
            <td>{project?.location ?? ""}</td>
            <th>Date of request</th>
            <td>{fmt(r.sentAt ?? r.createdAt)}</td>
          </tr>
          <tr>
            <th>Drawing sheet no.</th>
            <td>{r.sheetNumbers}</td>
            <th>Section(s) referenced</th>
            <td>{r.sectionsReferenced}</td>
          </tr>
          <tr>
            <th>Overview</th>
            <td colSpan={3}>{r.subject}</td>
          </tr>
          {impactRow("Cost impact", r.costImpact, r.costImpact !== "none" ? `   ${r.costNote || "Subject for variation"}` : null)}
          {impactRow("Time impact", r.timeImpact, r.timeImpact !== "none" && r.timeDays ? `   ${r.timeDays} day(s)` : null)}
        </tbody>
      </table>
      <div className="gap" />
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{isRfa ? "Approval requested" : "Request / clarification required"}</div>
      <div className="box">{r.requestText}</div>
      {reqFiles.length > 0 && <div style={{ marginTop: 3 }}>Attachments: {reqFiles.map((f) => f.filename).join(", ")}</div>}
      <div className="gap" />
      <table>
        <tbody>
          <tr>
            <th>Requested by</th>
            <td>{r.requestedByName}</td>
            <th>Role</th>
            <td>{r.requestedByRole.replace("-", " ")}</td>
          </tr>
          <tr>
            <th>Signature</th>
            <td><div className="sig" /></td>
            <th>Date</th>
            <td>{fmt(r.createdAt)}</td>
          </tr>
          <tr>
            <th>Countersigned by (Project Manager / person in charge)</th>
            <td>{r.countersignedByName ?? ""}</td>
            <th>Date</th>
            <td>{fmt(r.countersignedAt)}</td>
          </tr>
          <tr>
            <th>Signature</th>
            <td colSpan={3}><div className="sig" /></td>
          </tr>
        </tbody>
      </table>
      <div className="gap" />
      <div style={{ fontWeight: 600, marginBottom: 2 }}>Response</div>
      <div className="box" style={{ minHeight: 90 }}>{r.responseText ?? ""}</div>
      {resFiles.length > 0 && <div style={{ marginTop: 3 }}>Attachments: {resFiles.map((f) => f.filename).join(", ")}</div>}
      <div className="gap" />
      <table>
        <tbody>
          <tr>
            <th>Responding party</th>
            <td>{r.respondedByName ?? r.assignedToName ?? ""}</td>
            <th>Date of response</th>
            <td>{fmt(r.respondedAt)}</td>
          </tr>
          <tr>
            <th>Signature</th>
            <td colSpan={3}><div className="sig" /></td>
          </tr>
        </tbody>
      </table>
      {isRfa && (
        <>
          <div className="gap" />
          <table>
            <tbody>
              <tr>
                <th>Outcome</th>
                <td>
                  <Check on={r.status === "approved"} label="Approved" />
                  <Check on={r.status === "approved_as_noted"} label="Approved as noted" />
                  <Check on={r.status === "rejected"} label="Rejected" />
                </td>
                <td style={{ width: "32%" }}>
                  <div className="stamp">Stamp</div>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="gap" />
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Returned document (contractor's staff)</div>
          <table>
            <tbody>
              <tr>
                <th>Name</th>
                <td>{r.returnedByName ?? ""}</td>
                <th>Position</th>
                <td>{r.returnedByPosition ?? ""}</td>
              </tr>
              <tr>
                <th>Date / time received</th>
                <td colSpan={3}>{r.returnedAt ? new Date(r.returnedAt).toLocaleString() : ""}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </Shell>
  );
}

export function RequestPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { request, loading, error } = useRequestDetail(Number(id) || null);
  const [project, setProject] = useState<{ name: string; location: string | null } | null>(null);

  useEffect(() => {
    if (!request) return;
    let active = true;
    ProjectRepository.getById(request.projectCode)
      .then((p) => active && setProject(p ? { name: p.name, location: p.location ?? null } : null))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [request]);

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (error || !request) return <p role="alert" style={{ padding: 24 }}>{error ?? "Request not found."}</p>;
  return <RequestForm r={request} project={project} />;
}

function TransmittalForm({ t, project }: { t: Transmittal; project: { name: string; location: string | null } | null }) {
  const items = t.items ?? [];
  const rows = Math.max(items.length, 6);
  return (
    <Shell title="TRANSMITTAL" subtitle={`Control no. ${t.controlNo}`}>
      <table>
        <tbody>
          <tr>
            <th>Date</th>
            <td>{fmt(t.dateIssued)}</td>
            <th>Control no.</th>
            <td style={{ fontWeight: 700 }}>{t.controlNo}</td>
          </tr>
          <tr>
            <th>Project</th>
            <td>{project?.name ?? t.projectCode}</td>
            <th>Location</th>
            <td>{t.location ?? project?.location ?? ""}</td>
          </tr>
          <tr>
            <th>To</th>
            <td>{t.toName}</td>
            <th>Thru</th>
            <td>{t.thruName ?? ""}</td>
          </tr>
          <tr>
            <th>Type</th>
            <td colSpan={3}>
              <Check on={t.type === "inter-office"} label="Inter-office" />
              <Check on={t.type === "inter-agency"} label="Inter-agency" />
            </td>
          </tr>
          <tr>
            <th>Subject</th>
            <td colSpan={3}>{t.subject}</td>
          </tr>
        </tbody>
      </table>
      <div className="gap" />
      <div style={{ fontWeight: 600, marginBottom: 2 }}>Purpose</div>
      <div className="box" style={{ minHeight: 0 }}>
        {TRANSMITTAL_PURPOSES.map((p) => (
          <div key={p.value} style={{ display: "inline-block", width: "33%", marginBottom: 3 }}>
            <Check on={t.purposes.includes(p.value)} label={p.value === "others" && t.purposeOther ? `Others: ${t.purposeOther}` : p.label} />
          </div>
        ))}
      </div>
      <div className="gap" />
      <table>
        <thead>
          <tr>
            <th style={{ width: "6%" }}>#</th>
            <th>Request no. / particulars</th>
            <th style={{ width: "28%" }}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              <td>{items[i] ? i + 1 : ""}</td>
              <td>{items[i]?.particulars ?? ""}</td>
              <td>{items[i]?.remarks ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="gap" />
      <table>
        <tbody>
          <tr>
            <th>Transmitted by</th>
            <td>{t.transmittedByName}</td>
            <th>Received by</th>
            <td>{t.receivedByName ?? ""}</td>
          </tr>
          <tr>
            <th>Signature</th>
            <td><div className="sig" /></td>
            <th>Signature</th>
            <td><div className="sig" /></td>
          </tr>
        </tbody>
      </table>
      <div className="gap" />
      <div style={{ fontWeight: 600, marginBottom: 2 }}>Receipt / acknowledgement</div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Signature</th>
            <th>Department / office</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.max(t.acknowledgements?.length ?? 0, 3) }).map((_, i) => {
            const a = t.acknowledgements?.[i];
            return (
              <tr key={i}>
                <td>{a?.name ?? ""}</td>
                <td>{a?.signature ?? ""}</td>
                <td>{a?.office ?? ""}</td>
                <td>{a ? fmt(a.acknowledgedAt) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Shell>
  );
}

export function TransmittalPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [t, setT] = useState<Transmittal | null>(null);
  const [project, setProject] = useState<{ name: string; location: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    TransmittalRepository.get(Number(id))
      .then(async (row) => {
        if (!active) return;
        setT(row);
        const p = await ProjectRepository.getById(row.projectCode).catch(() => null);
        if (active) setProject(p ? { name: p.name, location: p.location ?? null } : null);
      })
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : "Could not load the transmittal"));
    return () => {
      active = false;
    };
  }, [id]);

  if (error) return <p role="alert" style={{ padding: 24 }}>{error}</p>;
  if (!t) return <p style={{ padding: 24 }}>Loading…</p>;
  return <TransmittalForm t={t} project={project} />;
}
