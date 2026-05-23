"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, MessagesSquare, Webhook, LogOut, MessageCircle } from "lucide-react";
import { useProfile } from "./ProfileProvider";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "./ThemeToggle";

// Header del dashboard: tabs de navegacion + tema + perfil activo.
// El tab "Webhooks" solo se muestra a perfiles con role 'dev'.

const TABS = [
  { href: "/conversations", label: "Testing", icon: MessagesSquare, devOnly: false },
  { href: "/wa", label: "WhatsApp", icon: MessageCircle, devOnly: true },
  { href: "/webhooks", label: "Webhooks", icon: Webhook, devOnly: true },
];

export function DashboardHeader() {
  const { profile, changeProfile } = useProfile();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!profile) return null;

  return (
    <header className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-3 sm:px-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-3 sm:gap-5">
        <span className="hidden py-3.5 text-sm font-semibold tracking-tight text-neutral-900 sm:block dark:text-neutral-100">
          Agentic&nbsp;Panel
        </span>
        <nav className="flex">
          {TABS.filter((t) => !t.devOnly || profile.role === "dev").map((tab) => {
            const active = pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 border-b-2 px-2 py-3.5 text-sm transition sm:px-3 ${
                  active
                    ? "border-violet-500 font-medium text-violet-700 dark:border-violet-400 dark:text-violet-300"
                    : "border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden min-[380px]:inline">{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg p-1 pr-1.5 text-sm transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Avatar name={profile.name} size="sm" />
            <span className="hidden text-sm font-medium text-neutral-700 sm:block dark:text-neutral-200">
              {profile.name}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-neutral-400" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                <div className="flex items-center gap-2 px-3 py-2">
                  <Avatar name={profile.name} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                      {profile.name}
                    </p>
                    <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                      {profile.role === "dev" ? "Desarrollador" : "Cliente"}
                    </p>
                  </div>
                </div>
                <div className="my-1 border-t border-neutral-100 dark:border-neutral-700" />
                <button
                  onClick={changeProfile}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <LogOut className="h-4 w-4" />
                  Cambiar perfil
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
