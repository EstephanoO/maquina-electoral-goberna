"use client";

import { createContext, useContext } from "react";

type MonitorThemePalette = {
  brandBlue: string;
  brandBlueStrong: string;
  brandBlueSoft: string;
  brandGold: string;
  brandGoldSoft: string;
  bg: string;
  surface: string;
  surfaceUp: string;
  surfaceAlt: string;
  surfaceSoft: string;
  border: string;
  borderStrong: string;
  text: string;
  textMid: string;
  textDim: string;
  green: string;
  greenSoft: string;
  orange: string;
  orangeSoft: string;
  red: string;
  redSoft: string;
  sky: string;
  skySoft: string;
  teal: string;
  tealSoft: string;
  purple: string;
  purpleSoft: string;
  shadow: string;
  gold: string;
  goldDim: string;
  goldFaint: string;
  goldBorder: string;
  blue: string;
  cyan: string;
};

const MONITOR_THEME_LIGHT: MonitorThemePalette = {
  brandBlue: "#163960",
  brandBlueStrong: "#102a47",
  brandBlueSoft: "#4f6f90",
  brandGold: "#FFC800",
  brandGoldSoft: "#fff3c2",
  bg: "#ffffff",
  surface: "#ffffff",
  surfaceUp: "#f7f9fb",
  surfaceAlt: "#f7f9fb",
  surfaceSoft: "#eef3f7",
  border: "#d9e1e8",
  borderStrong: "#c3d0db",
  text: "#163960",
  textMid: "#5b6b7a",
  textDim: "#7c8b99",
  green: "#2E8B57",
  greenSoft: "#e8f4ed",
  orange: "#E67E22",
  orangeSoft: "#fdf0e4",
  red: "#C0392B",
  redSoft: "#fae9e7",
  sky: "#5f83aa",
  skySoft: "#e8eef5",
  teal: "#3d8a94",
  tealSoft: "#e7f2f4",
  purple: "#7a6aa6",
  purpleSoft: "#efecf7",
  shadow: "0 14px 36px rgba(22,57,96,0.08)",
  gold: "#FFC800",
  goldDim: "#9f7a00",
  goldFaint: "#fff3c2",
  goldBorder: "#f1d97a",
  blue: "#5f83aa",
  cyan: "#3d8a94",
};

const MONITOR_THEME_DARK: MonitorThemePalette = {
  brandBlue: "#8fb2da",
  brandBlueStrong: "#dbe8f6",
  brandBlueSoft: "#6b8db4",
  brandGold: "#FFC800",
  brandGoldSoft: "rgba(255, 200, 0, 0.12)",
  bg: "#09121d",
  surface: "#090D15",
  surfaceUp: "#090D15",
  surfaceAlt: "#090D15",
  surfaceSoft: "#1a2738",
  border: "#1d2f43",
  borderStrong: "#2c425d",
  text: "#f7fbff",
  textMid: "#c7d7e8",
  textDim: "#95adc8",
  green: "#63d58a",
  greenSoft: "rgba(99, 213, 138, 0.18)",
  orange: "#ff9a5c",
  orangeSoft: "rgba(255, 154, 92, 0.18)",
  red: "#ff7d73",
  redSoft: "rgba(255, 125, 115, 0.16)",
  sky: "#7aa9d8",
  skySoft: "rgba(122, 169, 216, 0.16)",
  teal: "#63d1c9",
  tealSoft: "rgba(99, 209, 201, 0.18)",
  purple: "#b098f1",
  purpleSoft: "rgba(176, 152, 241, 0.18)",
  shadow: "0 18px 40px rgba(0,0,0,0.28)",
  gold: "#FFC800",
  goldDim: "#c8a42d",
  goldFaint: "rgba(255, 200, 0, 0.14)",
  goldBorder: "rgba(255, 200, 0, 0.24)",
  blue: "#7aa9d8",
  cyan: "#5fb7b1",
};

export type MonitorThemeMode = "light" | "dark";
export type MonitorTheme = MonitorThemePalette;

/** Static reference for module-level constants. For reactive theme, use useMonitorTheme(). */
export const MONITOR_THEME: MonitorTheme = MONITOR_THEME_LIGHT;

export function getMonitorTheme(mode: MonitorThemeMode): MonitorTheme {
  return mode === "dark" ? MONITOR_THEME_DARK : MONITOR_THEME_LIGHT;
}

const MonitorThemeContext = createContext<MonitorTheme>(MONITOR_THEME_LIGHT);

export function MonitorThemeProvider({ mode, children }: { mode: MonitorThemeMode; children: React.ReactNode }) {
  return <MonitorThemeContext.Provider value={getMonitorTheme(mode)}>{children}</MonitorThemeContext.Provider>;
}

export function useMonitorTheme(): MonitorTheme {
  return useContext(MonitorThemeContext);
}
