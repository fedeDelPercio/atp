"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { UserPlus, Loader2, ChevronRight } from "lucide-react";
import { useProfile } from "./ProfileProvider";
import { Avatar } from "./Avatar";
import type { Profile, ProfileRole } from "@/lib/supabase/types";

// Pantalla "¿Quién sos?": se muestra cuando no hay perfil en localStorage.

export function ProfileGate() {
  const { selectProfile } = useProfile();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<ProfileRole>("client");

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((d) => setProfiles(d.profiles ?? []))
      .catch(() => toast.error("No se pudieron cargar los perfiles"))
      .finally(() => setLoading(false));
  }, []);

  async function createProfile() {
    if (!name.trim()) {
      toast.error("Ingresá un nombre");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo crear el perfil");
        return;
      }
      selectProfile({ id: data.profile.id, name: data.profile.name, role: data.profile.role });
    } catch {
      toast.error("Error de red al crear el perfil");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-4 dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white">
          <span className="text-lg font-bold">A</span>
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          ¿Quién sos?
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Elegí tu perfil para entrar. Los comentarios y las conversaciones
          quedan firmados con él.
        </p>

        <div className="mt-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-400 dark:text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando perfiles…
            </div>
          ) : profiles.length === 0 ? (
            <p className="rounded-xl bg-neutral-50 px-3 py-4 text-center text-sm text-neutral-400 dark:bg-neutral-800/50 dark:text-neutral-500">
              Todavía no hay perfiles. Creá el primero abajo.
            </p>
          ) : (
            <ul className="space-y-1">
              {profiles.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() =>
                      selectProfile({ id: p.id, name: p.name, role: p.role as ProfileRole })
                    }
                    className="group flex w-full items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 text-left transition hover:border-violet-300 hover:bg-violet-50 dark:border-neutral-800 dark:hover:border-violet-500/40 dark:hover:bg-violet-500/10"
                  >
                    <Avatar name={p.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                        {p.name}
                      </p>
                      <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                        {p.role === "dev" ? "Desarrollador" : "Cliente"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-neutral-300 transition group-hover:text-violet-500 dark:text-neutral-600" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 border-t border-neutral-100 pt-5 dark:border-neutral-800">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Crear perfil nuevo
          </p>
          <div className="mt-3 space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <div className="grid grid-cols-2 gap-2">
              {(["client", "dev"] as ProfileRole[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    role === r
                      ? "border-violet-400 bg-violet-50 font-medium text-violet-700 dark:border-violet-500/50 dark:bg-violet-500/10 dark:text-violet-300"
                      : "border-neutral-300 text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:text-neutral-300"
                  }`}
                >
                  {r === "dev" ? "Desarrollador" : "Cliente"}
                </button>
              ))}
            </div>
            <button
              onClick={createProfile}
              disabled={creating}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Crear y entrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
