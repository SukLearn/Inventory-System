let installed = false;

function isNarrowScreen() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function expandLongSelect(select: HTMLSelectElement) {
  if (!isNarrowScreen() || select.options.length <= 6) return;
  select.size = Math.min(6, select.options.length);
  select.classList.add("mobile-select-open");
  select.setAttribute("aria-expanded", "true");
}

function collapseSelect(select: HTMLSelectElement) {
  if (!select.classList.contains("mobile-select-open")) return;
  select.removeAttribute("size");
  select.classList.remove("mobile-select-open");
  select.setAttribute("aria-expanded", "false");
}

export function installMobileControls() {
  if (installed) return;
  installed = true;

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const select = target.closest("select");

    document
      .querySelectorAll<HTMLSelectElement>("select.mobile-select-open")
      .forEach((openSelect) => {
        if (openSelect !== select) collapseSelect(openSelect);
      });

    if (select instanceof HTMLSelectElement) expandLongSelect(select);
  });

  document.addEventListener("focusin", (event) => {
    if (event.target instanceof HTMLSelectElement)
      expandLongSelect(event.target);
  });

  document.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const select = event.target;
    window.setTimeout(() => collapseSelect(select), 0);
  });

  document.addEventListener("focusout", (event) => {
    if (event.target instanceof HTMLSelectElement) collapseSelect(event.target);
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement) ||
      target.type !== "date" ||
      target.disabled ||
      target.readOnly
    )
      return;

    try {
      target.showPicker?.();
    } catch {
      // Browsers without showPicker still use their native date-input behavior.
    }
  });
}
