// Browser-side layout checks, shared with qa-ui and section verification.
export function auditUI() {
  const visible = (e) => {
    if (
      !e.getClientRects().length ||
      getComputedStyle(e).visibility === "hidden"
    )
      return false;
    const r = e.getBoundingClientRect();
    if (
      r.right <= 0 ||
      r.left >= innerWidth ||
      r.bottom <= 0 ||
      r.top >= innerHeight
    )
      return false;
    for (let p = e.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p),
        b = p.getBoundingClientRect();
      if (
        /hidden|auto|scroll|clip/.test(s.overflow) &&
        (r.bottom <= b.top ||
          r.top >= b.bottom ||
          r.right <= b.left ||
          r.left >= b.right)
      )
        return false;
    }
    return true;
  };
  const elements = [...document.querySelectorAll("#app *")].filter(visible);
  const nowrap = [],
    textBounds = [];
  for (const e of elements) {
    const style = getComputedStyle(e),
      label = e.dataset.action || e.id || e.className;
    if (
      style.whiteSpace === "nowrap" &&
      e.clientWidth &&
      e.scrollWidth > e.clientWidth + 1 &&
      style.textOverflow !== "ellipsis"
    )
      nowrap.push({ label, width: e.clientWidth, scroll: e.scrollWidth });
    if (
      ![...e.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
      ) ||
      e instanceof SVGElement
    )
      continue;
    const r = e.getBoundingClientRect();
    // A scrollport deliberately clips its moving contents; local card/text
    // containers still have to contain their text, and focus QA checks reachability.
    let scrollClipped = false;
    for (let p = e.parentElement; p && p.id !== "app"; p = p.parentElement) {
      const s = getComputedStyle(p),
        b = p.getBoundingClientRect();
      if (
        (/auto|scroll/.test(s.overflowX) &&
          p.scrollWidth > p.clientWidth + 1 &&
          (r.left < b.left || r.right > b.right)) ||
        (/auto|scroll/.test(s.overflowY) &&
          p.scrollHeight > p.clientHeight + 1 &&
          (r.top < b.top || r.bottom > b.bottom))
      )
        scrollClipped = true;
    }
    if (scrollClipped) continue;
    for (let p = e.parentElement; p && p.id !== "app"; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.position !== "static" || /hidden|clip/.test(s.overflow)) {
        const b = p.getBoundingClientRect();
        if (
          r.left < b.left - 1 ||
          r.right > b.right + 1 ||
          r.top < b.top - 1 ||
          r.bottom > b.bottom + 1
        )
          textBounds.push({
            label,
            parent: p.className,
            rect: [r.left, r.top, r.right, r.bottom],
            bounds: [b.left, b.top, b.right, b.bottom],
          });
        break;
      }
    }
  }
  return { nowrap, textBounds };
}

export function auditComfort() {
  const visible = (e) => {
    const r = e.getBoundingClientRect(),
      s = getComputedStyle(e);
    if (
      !r.width ||
      !r.height ||
      s.display === "none" ||
      s.visibility === "hidden" ||
      r.bottom <= 0 ||
      r.right <= 0 ||
      r.top >= innerHeight ||
      r.left >= innerWidth
    )
      return false;
    for (let p = e.parentElement; p && p.id !== "app"; p = p.parentElement) {
      const b = p.getBoundingClientRect(),
        c = getComputedStyle(p);
      if (
        /auto|scroll|hidden|clip/.test(c.overflowX + c.overflowY) &&
        (r.bottom <= b.top ||
          r.top >= b.bottom ||
          r.right <= b.left ||
          r.left >= b.right)
      )
        return false;
    }
    return true;
  };
  const elements = [...document.querySelectorAll("#app *")],
    shown = elements.filter(visible);
  return {
    targets: shown
      .filter((e) =>
        e.matches("button,[data-action],input:not([type=hidden]),select"),
      )
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.height < 43.5 ||
          (r.width < 43.5 && !e.matches("input[type=text],input[type=range]"))
        );
      })
      .map((e) => ({
        action: e.dataset.action || e.id,
        width: e.getBoundingClientRect().width,
        height: e.getBoundingClientRect().height,
      })),
    fonts: shown
      .filter(
        (e) =>
          /Inter/.test(getComputedStyle(e).fontFamily) &&
          (parseFloat(getComputedStyle(e).fontSize) >= 18 ||
            e.tagName === "BUTTON"),
      )
      .map((e) => e.outerHTML.slice(0, 180)),
    scrollKeys: elements
      .filter(
        (e) =>
          /auto|scroll/.test(
            getComputedStyle(e).overflowX + getComputedStyle(e).overflowY,
          ) && !e.dataset.scrollKey,
      )
      .map((e) => e.className),
  };
}
