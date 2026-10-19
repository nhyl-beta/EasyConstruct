// What the payroll engine assumes today (objectives fix 2.8): the rate versions,
// the values nobody has verified against an agency circular, and the plain
// statement that this is not a certified payroll engine. Shown on the HR payroll
// and Finance payroll review pages so no one reads the figures as more than they are.
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { getPayrollRules, visibleRateVersions, type PayrollRulesSummary } from "../payroll-api";

export function PayrollRulesNotice() {
  const [rules, setRules] = useState<PayrollRulesSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPayrollRules()
      .then((r) => !cancelled && setRules(r))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-foreground" role="note" aria-label="Payroll rules in use">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-strong" />
        <div className="space-y-1">
          <p className="font-medium">Not a certified payroll engine</p>
          {!rules ? (
            <p className="text-muted-foreground">Loading the rules in use…</p>
          ) : (
            <>
              <p className="text-muted-foreground">{rules.notCertified}</p>
              <p className="text-muted-foreground">
                Rate versions: {visibleRateVersions(rules.versions).map(([k, v]) => `${k} ${v}`).join(" · ")}. Overtime {rules.overtimeMultiplier}x, {rules.hoursPerDay}
                -hour day, {rules.workingDaysPerMonth} working days a month.
              </p>
              {rules.needsVerification.length > 0 ? (
                <div>
                  <p className="font-medium">Values still to be verified against the agency circular:</p>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {rules.needsVerification.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-muted-foreground">Every rate value has been marked verified.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
