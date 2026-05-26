import Image from "next/image";

// Marca de iBath para el header del dashboard. Override del componente
// default de main (que rendea un dot). El header importa `<BrandLogo />`
// y ahi va, sin condicionales — el archivo de esta branch decide que se
// rendea.
//
// Por ser horizontal (2048x574, wordmark + simbolo en linea), usamos h-6
// (24px) — ver CLAUDE.md seccion "Logo de cliente (brand-logo)".
//
// El componente rendea el logo + un separador vertical en el mismo
// fragment, asi el parent del header solo necesita gap-2.5 y todo queda
// proporcionado: [Logo] [sep] Agentic Panel.

export function BrandLogo() {
  return (
    <>
      <Image
        src="/brand-logo.png"
        alt="iBath"
        width={2048}
        height={574}
        priority
        className="h-6 w-auto invert dark:invert-0"
      />
      <span
        aria-hidden
        className="h-4 w-px bg-neutral-300 dark:bg-neutral-700"
      />
    </>
  );
}
