"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/components/AuthGate";

const links = [
  { href: "/", label: "Alertes" },
  { href: "/residents", label: "Residents" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="bg-blue-700 text-white shadow">
      <div className="max-w-5xl mx-auto px-4 flex items-center gap-6 h-14">
        <span className="font-bold text-lg tracking-tight">Eldercare</span>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`text-sm font-medium px-3 py-1 rounded transition ${
              path === l.href ? "bg-blue-900" : "hover:bg-blue-600"
            }`}
          >
            {l.label}
          </Link>
        ))}
        <button
          onClick={() => logout()}
          className="ml-auto text-sm font-medium px-3 py-1 rounded hover:bg-blue-600"
        >
          Déconnexion
        </button>
      </div>
    </nav>
  );
}
