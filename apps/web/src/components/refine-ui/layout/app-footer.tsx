/** Slim footer under every page of the app shell. */
export function AppFooter() {
  return (
    <footer className="mt-auto border-t border-border px-4 py-3 text-xs text-muted-foreground md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>EasyConstruct · Construction workflow management</span>
        <span>© {new Date().getFullYear()} EasyConstruct</span>
      </div>
    </footer>
  );
}
