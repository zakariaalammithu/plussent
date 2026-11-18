import AppNav from "./AppNav";

/** App-page shell (sidebar + main) for pages outside /dashboard, which has its own layout. */
export default function AppShell({ current, title, subtitle, children }: {
  current: string; title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <AppNav current={current} />
      <div className="app-main">
        <div className="app-topbar">
          <h1>{title}</h1>
          {subtitle && <span className="muted small">{subtitle}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}
