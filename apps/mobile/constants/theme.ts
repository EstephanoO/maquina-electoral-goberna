/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#163960';
const tintColorDark = '#FFC800';

export const Colors = {
  light: {
    text: '#163960',
    background: '#fff',
    tint: tintColorLight,
    icon: '#163960',
    tabIconDefault: '#163960',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#FFFFFF',
    background: '#163960',
    tint: tintColorDark,
    icon: '#FFC800',
    tabIconDefault: '#FFC800',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'Montserrat-Bold',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'Montserrat-Bold',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'Montserrat-Bold',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'Montserrat-Bold',
  },
  default: {
    sans: 'Montserrat-Bold',
    serif: 'Montserrat-Bold',
    rounded: 'Montserrat-Bold',
    mono: 'Montserrat-Bold',
  },
  web: {
    sans: "'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    serif: "'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    rounded: "'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'Montserrat', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
});
