import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { light, dark, spacing, type, radii, elevation, Palette } from './tokens';

export interface Theme {
  colors: Palette;
  dark: boolean;
  spacing: typeof spacing;
  type: typeof type;
  radii: typeof radii;
  elevation: typeof elevation;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const value = useMemo<Theme>(() => ({
    colors: scheme === 'dark' ? dark : light,
    dark: scheme === 'dark',
    spacing, type, radii, elevation,
  }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme must be used inside ThemeProvider');
  return t;
}
