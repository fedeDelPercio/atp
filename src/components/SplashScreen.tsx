"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// Splash de bienvenida: overlay negro full-screen con el logo del cliente,
// se desmonta luego de la animacion. Se monta en el root layout, asi corre
// una vez por full page load (las navegaciones internas de Next no lo
// re-disparan porque el layout no se remonta).
//
// Si el archivo /brand-logo.png no existe, el onError del Image dispara
// el unmount inmediato sin mostrar el flash negro mas que un instante.
//
// Timeline (desde que el logo carga):
//   t=0       logo invisible (loading)
//   t=0..500  logo fade in
//   t=500..1100  hold
//   t=1100..1600 wrapper fade out (logo se va con el)
//   t=1600    unmount

type Phase = "loading" | "showing" | "fading" | "gone";

export function SplashScreen() {
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    if (phase !== "showing") return;
    const t1 = setTimeout(() => setPhase("fading"), 1100);
    const t2 = setTimeout(() => setPhase("gone"), 1600);
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
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black transition-opacity duration-500 ease-in-out ${
        wrapperVisible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <Image
        src="/brand-logo.png"
        alt=""
        width={2048}
        height={574}
        priority
        onLoad={() => setPhase("showing")}
        onError={() => setPhase("gone")}
        className={`h-16 w-auto transition-opacity duration-500 ease-out sm:h-20 ${
          logoVisible ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
