"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// Splash de bienvenida: overlay negro full-screen con el logo de Quintaglia,
// se desmonta luego de la animacion. Se monta en el root layout, asi corre
// una vez por full page load (las navegaciones internas de Next no lo
// re-disparan porque el layout no se remonta).
//
// El logo de Quintaglia es cuadrado (1000x1000), asi que usamos h-32 sm:h-40
// en vez de h-16 sm:h-20 (que sirve para logos horizontales tipo iBath). Ver
// CLAUDE.md seccion "Splash de bienvenida" para la regla por aspect ratio.
//
// Timeline (desde que el logo carga):
//   t=0       logo invisible (loading)
//   t=0..700  logo fade in
//   t=700..1500  hold
//   t=1500..2200 wrapper fade out (logo se va con el)
//   t=2200    unmount

type Phase = "loading" | "showing" | "fading" | "gone";

export function SplashScreen() {
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    if (phase !== "showing") return;
    const t1 = setTimeout(() => setPhase("fading"), 1500);
    const t2 = setTimeout(() => setPhase("gone"), 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase]);

  if (phase === "gone") return null;

  const wrapperVisible = phase !== "fading";
  const logoVisible = phase === "showing" || phase === "fading";

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity duration-700 ease-in-out ${
        wrapperVisible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <Image
        src="/brand-logo.png"
        alt=""
        width={1000}
        height={1000}
        priority
        onLoad={() => setPhase("showing")}
        onError={() => setPhase("gone")}
        className={`h-32 w-auto transition-opacity duration-700 ease-out sm:h-40 ${
          logoVisible ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
