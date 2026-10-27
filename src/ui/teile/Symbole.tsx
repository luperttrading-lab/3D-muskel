// Linien-Symbole (24 × 24, currentColor)
import type { SVGProps } from 'react';
const S = (p: SVGProps<SVGSVGElement>) => <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p} />;
export const Haus = () => <S><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></S>;
export const Figur = () => <S><circle cx="12" cy="4.5" r="2.2" /><path d="M7.5 9.5c1.3-.8 2.8-1.2 4.5-1.2s3.2.4 4.5 1.2l1.4 5.5M7.5 9.5 6.1 15M10 21l.8-7h2.4l.8 7M9.3 13.5l-.5-4M14.7 13.5l.5-4" /></S>;
export const Hantel = () => <S><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" /></S>;
export const Kurve = () => <S><path d="M3 20h18M5 16l4-5 3 3 6-8" /></S>;
export const Sprechblase = () => <S><path d="M4 5h16v10H9l-5 4z" /><path d="M8 9h8M8 12h5" /></S>;
export const Zahnrad = () => <S><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></S>;
export const Haken = () => <S><path d="M5 12l5 5L20 7" /></S>;
export const Kreuz = () => <S><path d="M6 6l12 12M18 6 6 18" /></S>;
export const Plus = () => <S><path d="M12 5v14M5 12h14" /></S>;
export const Minus = () => <S><path d="M5 12h14" /></S>;
export const Mond = () => <S><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></S>;
