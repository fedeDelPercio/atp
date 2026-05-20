// Avatar con iniciales y color determinístico a partir del nombre.
// Se usa para perfiles, clientes simulados y autores de comentarios.

const PALETTE = [
  "bg-violet-100 text-violet-700 dark:bg-violet-500/25 dark:text-violet-200",
  "bg-blue-100 text-blue-700 dark:bg-blue-500/25 dark:text-blue-200",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/25 dark:text-amber-200",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/25 dark:text-rose-200",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/25 dark:text-cyan-200",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-200",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/25 dark:text-orange-200",
];

const SIZES = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? "";
  if (!first) return "?";
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + (words[1] ?? "").charAt(0)).toUpperCase();
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: keyof typeof SIZES;
}) {
  const color = PALETTE[hash(name) % PALETTE.length] ?? PALETTE[0]!;
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]} ${color}`}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
