import type { KeyboardEvent } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function trapDialogTab(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const elements = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(focusableSelector),
  ].filter(
    (element) =>
      !element.hidden && element.getAttribute("aria-hidden") !== "true",
  );
  if (!elements.length) return;
  const first = elements[0],
    last = elements[elements.length - 1],
    active = document.activeElement;
  if (
    event.shiftKey &&
    (active === first || !event.currentTarget.contains(active))
  ) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
