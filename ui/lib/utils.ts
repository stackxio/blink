/**
 * Merge class names, filtering out falsy values.
 * This is a lightweight placeholder — swap in clsx + tailwind-merge
 * once shadcn/ui is added.
 */
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}
