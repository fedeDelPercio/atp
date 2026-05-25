import Image from "next/image";

// Marca del cliente en el header del dashboard. Convencion del repo:
// cada client branch deja su logo en public/brand-logo.png (asset blanco
// con fondo transparente, formato horizontal). El header lo renderiza al
// lado del titulo "Agentic Panel".
//
// La altura se fija via Tailwind (h-5 / 20px) para que entre dentro del
// padding del header sin agrandarlo. El ancho se calcula automaticamente
// con el aspect ratio del archivo (next/image lo maneja).
//
// La PNG es blanca, asi que se invierte en light mode para que quede
// negra sobre fondo blanco (y se mantiene blanca en dark mode).

export function BrandLogo() {
  return (
    <Image
      src="/brand-logo.png"
      alt="iBath"
      width={2048}
      height={574}
      priority
      className="h-5 w-auto invert dark:invert-0"
    />
  );
}
