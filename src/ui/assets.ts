/** The address of a file in public/, from any page (/ or /da/). */
export function assetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path}`, location.href).href;
}
