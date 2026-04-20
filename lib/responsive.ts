import { Dimensions, PixelRatio, Platform } from 'react-native';

/**
 * Responsive scaling utility for consistent sizing across all devices.
 *
 * The base design width is 375 (iPhone SE / standard).
 * All hardcoded pixel values should flow through these helpers
 * so they scale proportionally on smaller (320) and larger (428+) screens.
 */

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

/**
 * Scale a value proportionally to screen width.
 * Use for horizontal spacing, widths, border-radius, padding, icon sizes.
 */
export function wp(size: number): number {
  const scaled = (SCREEN_WIDTH / BASE_WIDTH) * size;
  return Math.round(PixelRatio.roundToNearestPixel(scaled));
}

/**
 * Scale a value proportionally to screen height.
 * Use for vertical spacing, heights, top/bottom padding.
 */
export function hp(size: number): number {
  const scaled = (SCREEN_HEIGHT / BASE_HEIGHT) * size;
  return Math.round(PixelRatio.roundToNearestPixel(scaled));
}

/**
 * Moderate scale — blends width-based scaling with the original size.
 * Prevents font sizes from becoming too large on tablets or too small on tiny screens.
 * factor 0 = no scaling, factor 1 = full width-based scaling.
 * Default factor 0.5 for balanced scaling.
 */
export function ms(size: number, factor = 0.5): number {
  const scaled = size + (wp(size) - size) * factor;
  return Math.round(PixelRatio.roundToNearestPixel(scaled));
}

/** Current screen width (snapshot at module init) */
export const screenWidth = SCREEN_WIDTH;

/** Current screen height (snapshot at module init) */
export const screenHeight = SCREEN_HEIGHT;

/** Whether the device is a small screen (iPhone SE / older Android) */
export const isSmallDevice = SCREEN_WIDTH < 375;

/** Whether the device is a large screen (iPhone Pro Max / large Android) */
export const isLargeDevice = SCREEN_WIDTH >= 414;

/** Whether this is running on iOS */
export const isIOS = Platform.OS === 'ios';
