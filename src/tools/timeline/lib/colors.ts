/** Character colors are picked for the story, not for this dark UI; very dark ones (Takaya's black) get lifted so lanes,
 *  borders and links stay visible. */
export function visible(color: string): string {
  const m = color.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => v / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.18 ? `color-mix(in srgb, ${color} 45%, #d9d0c7)` : color;
}
