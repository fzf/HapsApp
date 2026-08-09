export interface Palette {
  // Surfaces
  background: string;      // screen ground
  surface: string;         // cards, sheet
  surfaceAlt: string;      // secondary panels, stats strip
  border: string;
  borderStrong: string;
  overlay: string;         // scrim behind floating controls
  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  // Brand + semantic
  primary: string;
  onPrimary: string;
  primarySoft: string;     // selected-row wash
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  // Map-specific
  mapControlBg: string;    // floating pill/button background
  visitPin: string;
  visitPinSelected: string;
}

export const light: Palette = {
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F4',
  border: '#E8EAED',
  borderStrong: '#DADCE0',
  overlay: 'rgba(255,255,255,0.92)',
  textPrimary: '#202124',
  textSecondary: '#5F6368',
  textTertiary: '#9AA0A6',
  textInverse: '#FFFFFF',
  primary: '#1A73E8',
  onPrimary: '#FFFFFF',
  primarySoft: '#E8F0FE',
  success: '#188038',
  successSoft: '#E6F4EA',
  warning: '#E37400',
  warningSoft: '#FEF7E0',
  danger: '#D93025',
  dangerSoft: '#FCE8E6',
  mapControlBg: 'rgba(255,255,255,0.95)',
  visitPin: '#1A73E8',
  visitPinSelected: '#174EA6',
};

export const dark: Palette = {
  background: '#202124',
  surface: '#2D2E30',
  surfaceAlt: '#35363A',
  border: '#3C4043',
  borderStrong: '#5F6368',
  overlay: 'rgba(32,33,36,0.92)',
  textPrimary: '#E8EAED',
  textSecondary: '#9AA0A6',
  textTertiary: '#80868B',
  textInverse: '#202124',
  primary: '#8AB4F8',
  onPrimary: '#202124',
  primarySoft: 'rgba(138,180,248,0.16)',
  success: '#81C995',
  successSoft: 'rgba(129,201,149,0.16)',
  warning: '#FDD663',
  warningSoft: 'rgba(253,214,99,0.16)',
  danger: '#F28B82',
  dangerSoft: 'rgba(242,139,130,0.16)',
  mapControlBg: 'rgba(45,46,48,0.95)',
  visitPin: '#8AB4F8',
  visitPinSelected: '#AECBFA',
};

// Travel polyline colors — chosen to read on both Apple light & dark tiles
export const modeColors = {
  walking: '#188038',
  cycling: '#1A73E8',
  driving: '#E37400',
  highway: '#D93025',
  unknown: '#80868B',
} as const;
export type ModeKey = keyof typeof modeColors;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const type = {
  title: { fontSize: 20, fontWeight: '600' as const },
  heading: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  bodyBold: { fontSize: 14, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '500' as const },
} as const;

export const radii = { sm: 8, md: 12, lg: 16, pill: 24, full: 999 } as const;

export const elevation = {
  card: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12, shadowRadius: 3, elevation: 2,
  },
  floating: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 6, elevation: 5,
  },
} as const;
