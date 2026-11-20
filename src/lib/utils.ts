/**
 * Tiny shared helpers: class merging + display formatters.
 * The UI is hand-rolled (no component library), so a 3-line `cn` keeps
 * conditional class composition readable without pulling in dependencies.
 */

/** Join truthy class names: `cn('a', cond && 'b')` → "a b". */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** 1234567 → "1.2 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 'B';
  for (const next of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = next;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

/** ISO date → "12 Mar 2025" (stable across locales for a consistent UI). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
