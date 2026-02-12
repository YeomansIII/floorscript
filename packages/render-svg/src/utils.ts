/** Round a number for clean SVG attribute output */
export function n(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** Escape XML special characters in text content */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
