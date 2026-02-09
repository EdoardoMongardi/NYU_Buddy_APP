/**
 * Platform and browser detection utilities for installation banner
 * Detects device type, OS, and browser to show appropriate installation guide
 */

// Extend Navigator interface to include iOS-specific standalone property
interface NavigatorStandalone extends Navigator {
  standalone?: boolean;
}

export interface PlatformInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isDesktop: boolean;
  isIOSSafari: boolean;
  isIOSChrome: boolean;
  isIOSEdge: boolean;
  isIOSFirefox: boolean;
  isStandalone: boolean;
  canInstall: boolean;
}

/**
 * Detect if running on iOS
 */
function detectIOS(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = window.navigator.userAgent;
  const isIOSUA = /iPad|iPhone|iPod/.test(ua);

  // Also check for iPad on iOS 13+ which reports as Mac
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  return isIOSUA || isIPadOS;
}

/**
 * Detect if running on Android
 */
function detectAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android/.test(window.navigator.userAgent);
}

/**
 * Detect if running in standalone mode (PWA installed)
 * Uses both matchMedia and navigator.standalone for iOS compatibility
 */
function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  // Check display-mode media query (works on most platforms)
  const isDisplayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;

  // Check navigator.standalone (iOS-specific)
  const isNavigatorStandalone = 'standalone' in navigator && (navigator as NavigatorStandalone).standalone === true;

  return isDisplayModeStandalone || isNavigatorStandalone;
}

/**
 * Detect if running in iOS Safari (not Chrome, Edge, or Firefox)
 * Refined detection excluding CriOS (Chrome), EdgiOS (Edge), FxiOS (Firefox)
 */
function detectIOSSafari(isIOS: boolean): boolean {
  if (!isIOS || typeof window === 'undefined') return false;

  const ua = window.navigator.userAgent;

  // Must be Safari and NOT Chrome, Edge, or Firefox
  const isSafari = /Safari/.test(ua);
  const isNotOtherBrowser = !/CriOS|FxiOS|EdgiOS/.test(ua);

  return isSafari && isNotOtherBrowser;
}

/**
 * Detect if running in iOS Chrome
 */
function detectIOSChrome(isIOS: boolean): boolean {
  if (!isIOS || typeof window === 'undefined') return false;
  return /CriOS/.test(window.navigator.userAgent);
}

/**
 * Detect if running in iOS Edge
 */
function detectIOSEdge(isIOS: boolean): boolean {
  if (!isIOS || typeof window === 'undefined') return false;
  return /EdgiOS/.test(window.navigator.userAgent);
}

/**
 * Detect if running in iOS Firefox
 */
function detectIOSFirefox(isIOS: boolean): boolean {
  if (!isIOS || typeof window === 'undefined') return false;
  return /FxiOS/.test(window.navigator.userAgent);
}

/**
 * Get comprehensive platform information
 */
export function getPlatformInfo(): PlatformInfo {
  const isIOS = detectIOS();
  const isAndroid = detectAndroid();
  const isDesktop = !isIOS && !isAndroid;
  const isStandalone = detectStandalone();
  const isIOSSafari = detectIOSSafari(isIOS);
  const isIOSChrome = detectIOSChrome(isIOS);
  const isIOSEdge = detectIOSEdge(isIOS);
  const isIOSFirefox = detectIOSFirefox(isIOS);

  // Can install if:
  // - iOS Safari (not standalone)
  // - Android (not standalone)
  // iOS Chrome/Edge/Firefox users need to switch to Safari
  const canInstall = (isIOSSafari || isAndroid) && !isStandalone;

  return {
    isIOS,
    isAndroid,
    isDesktop,
    isIOSSafari,
    isIOSChrome,
    isIOSEdge,
    isIOSFirefox,
    isStandalone,
    canInstall,
  };
}

/**
 * Get user-friendly browser name for iOS non-Safari browsers
 */
export function getIOSBrowserName(platform: PlatformInfo): string {
  if (platform.isIOSChrome) return 'Chrome';
  if (platform.isIOSEdge) return 'Edge';
  if (platform.isIOSFirefox) return 'Firefox';
  return 'this browser';
}