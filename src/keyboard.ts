/** Use the host's conventions in every shortcut hint, including compact controls. */
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
export const modifierLabel = isMac ? '⌘' : 'Ctrl';
export const shiftLabel = isMac ? '⇧' : 'Shift';
export const shortcut = (key: string) => isMac ? `⌘${key}` : `Ctrl+${key}`;
export const redoShortcut = isMac ? '⇧⌘Z' : 'Ctrl+Y';

/** IME and AltGr/Option input belongs to the keyboard layout, not the editor. */
export function isTextComposition(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}
