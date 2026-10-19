import type { ReactNode } from "react";
import { HardHat } from "lucide-react";
import { AuthBrandPanel } from "@/components/ui/auth/auth-brand-panel";
import { ThemeToggle } from "@/components/refine-ui/theme/theme-toggle";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,600px)]">
      <AuthBrandPanel />
      <main className="relative flex flex-col">
        <div className="flex items-center justify-between p-6 lg:justify-end">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HardHat className="size-5" aria-hidden="true" />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">
              EasyConstruct
            </span>
          </div>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-12 sm:px-8">
          <div className="w-full max-w-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}