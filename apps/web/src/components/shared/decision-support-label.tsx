import { Lightbulb } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Marks a surface as rule-based advice. Every decision-support output in the
 * app carries it so nobody reads a suggestion as an instruction: the system
 * never approves, rejects or applies anything on its own.
 */
export function DecisionSupportLabel({ className, basis }: { className?: string; basis?: string }) {
  return (
    <Badge
      variant="ai"
      className={cn("gap-1", className)}
      title={basis ?? "Rule-based advice. It never blocks or applies anything."}
    >
      <Lightbulb />
      Decision support: a person decides
    </Badge>
  );
}
