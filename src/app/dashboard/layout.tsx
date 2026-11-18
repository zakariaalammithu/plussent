import AppNav from "../_components/AppNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <AppNav current="/dashboard" />
      <div className="app-main">{children}</div>
    </div>
  );
}
