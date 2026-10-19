import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  label: string;
  toneClass: string;
  size?: "sm" | "md";
}

export function StatusBadge({ label, toneClass, size = "md" }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={`rounded-full font-medium ${toneClass} ${
        size === "sm" ? "px-2 py-0.5 text-overline" : "px-2.5 py-0.5 text-overline"
      }`}
    >
      {label}
    </Badge>
  );
}