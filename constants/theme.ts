export const C = {
  bg:        "#18161A",
  surface:   "#201E24",
  raised:    "#2A2830",
  border:    "#3C3847",
  accent:    "#7C5CFF",
  accentDim: "#7C5CFF20",
  green:     "#22C55E",
  amber:     "#F59E0B",
  red:       "#EF4444",
  sky:       "#38BDF8",
  emote:     "#A78BFA",
  text:      "#F0EEF8",
  textDim:   "#B8B3C6",
  muted:     "#8A85A0",
  timBubble: "#3D2F70",
  eliBubble: "#252333",
  eliGradFrom: "#4B1D8E",
  eliGradTo:   "#1D4B8E",
} as const;

export type ColorKey = keyof typeof C;
