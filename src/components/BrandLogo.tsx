// Marca del cliente para el header del dashboard.
//
// Convencion: este componente vive en TODAS las branches con la implementacion
// que corresponda al cliente. En main rendea un dot neutro (el panel sin
// marca propia). Las branches client/* sobre-escriben el archivo con su
// propia version que renderea el logo + separador antes del texto
// "Agentic Panel".
//
// Tener BrandLogo siempre presente permite que DashboardHeader.tsx sea
// 100% compartido y que las sincronizaciones de main → client/* no
// rompan la marca del cliente.

export function BrandLogo() {
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 rounded-full bg-neutral-900 dark:bg-neutral-50"
    />
  );
}
