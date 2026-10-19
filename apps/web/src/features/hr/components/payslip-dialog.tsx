import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format-currency";
import { visibleRateVersions, type PayrollLine } from "@/features/hr/payroll-api";

const AGENCY_LABEL: Record<string, string> = {
  sss: "SSS",
  philhealth: "PhilHealth",
  pagibig: "Pag-IBIG",
  overtime: "Overtime",
};

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 text-sm ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

// Shown to HR and Finance. Printable: the Print button calls window.print(),
// and the print rules in App.css (keyed on data-print-payslip) hide everything
// except this dialog's content, so the paper has only the payslip.
export function PayslipDialog({
  line,
  onClose,
}: {
  line: PayrollLine | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={line !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-print-payslip className="max-w-md rounded-2xl">
        {line && (
          <>
            <DialogHeader>
              <DialogTitle>Payslip · {line.name}</DialogTitle>
              <DialogDescription>
                {line.empId} · {line.role} · {line.period}
              </DialogDescription>
            </DialogHeader>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earnings</h3>
              <Row label="Regular hours" value={String(line.hours)} />
              <Row label="Overtime hours" value={String(line.overtime)} />
              <Row label="Adjustments" value={formatCurrency(line.adjustments)} />
              <Row label="Gross pay" value={formatCurrency(line.gross)} bold />
            </section>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Deductions (employee share)
              </h3>
              <Row label="SSS" value={formatCurrency(line.sss)} />
              <Row label="PhilHealth" value={formatCurrency(line.philhealth)} />
              <Row label="Pag-IBIG" value={formatCurrency(line.pagibig)} />
              <Row label="Total deductions" value={formatCurrency(line.deductions)} bold />
            </section>

            <div className="rounded-xl border bg-muted/30 px-3 py-2">
              <Row label="Net pay" value={formatCurrency(line.net)} bold />
            </div>

            <p className="text-overline text-muted-foreground">
              Rates used:{" "}
              {line.rateVersions
                ? visibleRateVersions(line.rateVersions)
                    .map(([k, v]) => `${AGENCY_LABEL[k] ?? k} ${v}`)
                    .join(" · ")
                : "not recorded (generated before rate versions were stored)"}
            </p>

            <DialogFooter data-print-hide className="gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button type="button" onClick={() => window.print()}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                Print payslip
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
