/**
 * Dismiss the on-screen keyboard for mobile search inputs.
 * @param {React.RefObject<HTMLInputElement | null>} [inputRef]
 */
export function dismissMobileSearchKeyboard(inputRef) {
  if (typeof document === "undefined") return;

  inputRef?.current?.blur();

  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) {
    active.blur();
  }
}
