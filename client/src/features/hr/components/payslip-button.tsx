import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PayrollLine } from "@/features/hr/payroll-api";

// The one "open this employee's payslip" button, used by HR payroll and the
// Finance review so the two never drift apart.
export function PayslipButton({
  line,
  onOpen,
}: {
  line: PayrollLine;
  onOpen: (line: PayrollLine) => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`View payslip for ${line.name}`}
      onClick={() => onOpen(line)}
    >
      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      Payslip
    </Button>
  );
}
