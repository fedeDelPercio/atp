import Image from "next/image";

// Marca de Quintaglia para el header del dashboard. Override del componente
// default de main (que rendea un dot). El header importa `<BrandLogo />`
// y ahi va, sin condicionales — el archivo de esta branch decide que se
// rendea.
//
// AD-HOC para Quintaglia: usamos h-10 en vez del h-7 que recomienda
// CLAUDE.md para logos cuadrados. El wordmark "QUINTAGLIA" + bajada
// "Desarrollos Inmobiliarios" stackeado bajo el simbolo necesita mas
// altura para ser legible (a h-7 la bajada queda por debajo del umbral
// de lectura ~12px). h-10 la lleva a ~16-18px y queda legible sin
// agrandar el header.
//
// El componente rendea el logo + un separador vertical en el mismo
// fragment, asi el parent del header solo necesita gap-2.5 y todo queda
// proporcionado: [Logo] [sep] Agentic Panel.

export function BrandLogo() {
  return (
    <>
      <Image
        src="/brand-logo.png"
        alt="Quintaglia"
        width={1000}
        height={1000}
        priority
        className="h-10 w-auto invert dark:invert-0"
      />
      <span
        aria-hidden
        className="h-4 w-px bg-neutral-300 dark:bg-neutral-700"
      />
    </>
  );
}
