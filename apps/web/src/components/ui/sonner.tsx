import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // B-177: sonner's default collapses a stack into a single peeking
      // card — fine for one toast at a time, but rapid-fire submissions
      // (e.g. spam-clicking Approve) piled several on top of each other with
      // only the newest readable. `expand` keeps every toast fully stacked
      // and visible instead of collapsed.
      expand
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
