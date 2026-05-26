import Image from "next/image";

// Marca de Quintaglia en el header del dashboard. El logo (en
// public/brand-logo.png) es BLANCO sobre transparente, formato cuadrado
// (1000x1000 aprox): contiene el simbolo + wordmark "QUINTAGLIA /
// Desarrollos Inmobiliarios" stackeado vertical.
//
// Por ser cuadrado (no horizontal como el de iBath), usamos h-7 (28px)
// en vez de h-6 para que ocupe un ancho similar al wordmark "Agentic
// Panel" del texto al lado. Ver CLAUDE.md seccion "Logo de cliente
// (brand-logo)" para la regla por aspect ratio.
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
      className="h-7 w-auto invert dark:invert-0"
    />
  );
}
