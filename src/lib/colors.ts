import type { ColorKey } from "./types";

/** Maps a ColorKey to the CSS custom properties defined in the theme. */
export const colorVars: Record<ColorKey, { solid: string; wash: string }> = {
  accent: { solid: "var(--accent)", wash: "var(--accent-wash)" },
  sage: { solid: "var(--sage)", wash: "var(--sage-wash)" },
  gold: { solid: "var(--gold)", wash: "var(--gold-wash)" },
  sky: { solid: "var(--sky)", wash: "var(--sky-wash)" },
  plum: { solid: "var(--plum)", wash: "var(--plum-wash)" },
  ink: { solid: "var(--ink-soft)", wash: "var(--paper-sunken)" },
};

export const COLOR_LABELS: Record<ColorKey, string> = {
  accent: "Vermilion",
  sage: "Sage",
  gold: "Gold",
  sky: "Sky",
  plum: "Plum",
  ink: "Ink",
};
