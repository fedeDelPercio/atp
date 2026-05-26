import Image from "next/image";

// Marca de Quintaglia en el header del dashboard. El logo (en
// public/brand-logo.png) es BLANCO sobre transparente, formato cuadrado
// (1000x1000 aprox): contiene el simbolo + wordmark "QUINTAGLIA /
// Desarrollos Inmobiliarios" stackeado vertical.
//
// AD-HOC para Quintaglia: usamos h-10 en vez del h-7 que recomienda
// CLAUDE.md para logos cuadrados. El wordmark "QUINTAGLIA" + bajada
// "Desarrollos Inmobiliarios" stackeado bajo el simbolo necesita mas
// altura para ser legible (a h-7 el wordmark queda por debajo del
// umbral de lectura ~12px). Mantiene el header dentro del padding sin
// agrandarlo.
//
// invert dark:invert-0 aprovecha que el PNG es blanco: en light mode se
// invierte a negro; en dark mode queda blanco.

export function BrandLogo() {
  return (
    <Image
      src="/brand-logo.png"
      alt="Quintaglia"
      width={1000}
      height={1000}
      priority
      className="h-10 w-auto invert dark:invert-0"
    />
  );
}
