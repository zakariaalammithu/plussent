import Link from "next/link";
import BrandLogo from "./BrandLogo";

export const NAV_SECTIONS: { group: string; items: { href: string; label: string }[] }[] = [
  {
    group: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/leads", label: "Leads" },
      { href: "/leads/finder", label: "Lead Finder" },
      { href: "/campaigns", label: "Campaigns" },
      { href: "/sequences", label: "Sequences" },
      { href: "/accounts", label: "Email Accounts" },
      { href: "/inbox", label: "Unified Inbox" },
    ],
  },
  {
    group: "Deliverability",
    items: [
      { href: "/warmup", label: "Email Warmup" },
      { href: "/deliverability", label: "Deliverability" },
      { href: "/analytics", label: "Analytics" },
      { href: "/reports", label: "Reports" },
    ],
  },
  {
    group: "Tools",
    items: [
      { href: "/ai", label: "AI Assistant" },
      { href: "/integrations", label: "Integrations" },
      { href: "/team", label: "Team" },
      { href: "/billing", label: "Billing" },
      { href: "/settings", label: "Settings" },
      { href: "/help", label: "Help" },
      { href: "/admin", label: "Admin" },
    ],
  },
];

/** Shared app sidebar. `current` highlights the active section. */
export default function AppNav({ current }: { current?: string }) {
  return (
    <aside className="sidebar">
      <Link href="/dashboard" aria-label="PlusSent — dashboard" style={{ padding: "0.25rem 0.5rem 0.75rem", display: "inline-flex" }}>
        <BrandLogo variant="full" height={30} />
      </Link>
      {NAV_SECTIONS.map((s) => (
        <div key={s.group}>
          <div className="side-group">{s.group}</div>
          {s.items.map((it) => (
            <Link key={it.href} href={it.href} className={current === it.href ? "active" : undefined}>
              {it.label}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  );
}
