// Farbskalen für die Darstellungen »Entwicklung« und »Atlas« (linear, RGB 0..1).
type RGB = [number, number, number];
// Farben werden in sRGB angegeben und für den Shader (linearer Farbraum) umgerechnet
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hex = (h: string): RGB => [linear(parseInt(h.slice(1, 3), 16) / 255), linear(parseInt(h.slice(3, 5), 16) / 255), linear(parseInt(h.slice(5, 7), 16) / 255)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function skala(stops: [number, string][], v: number): RGB {
  const x = Math.min(1, Math.max(0, v));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) return mix(hex(stops[i - 1][1]), hex(stops[i][1]), (x - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  }
  return hex(stops[stops.length - 1][1]);
}

// Schon wenige Prozent sollen sichtbar blau werden: die ersten Wochen sind die, in denen man Rückmeldung braucht
export const ENTWICKLUNG_STOPS: [number, string][] = [[0, '#34405e'], [0.04, '#2f8bff'], [0.35, '#f5b041'], [1, '#ff3b30']];
export const entwicklungsFarbe = (v: number) => skala(ENTWICKLUNG_STOPS, v);
export const atlasFarbe = (v: number) => mix(hex('#a8392b'), hex('#f06448'), Math.min(1, Math.max(0, v)));
export const HAUT_OHNE_MUSKEL: Record<'entwicklung' | 'atlas', RGB> = { entwicklung: hex('#56607a'), atlas: hex('#d9c6b5') };
