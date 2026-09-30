// Drag-to-pan for the graph canvas.
//
// The graph is far wider than any viewport, so it has to scroll. Native scrollbars
// work but are a poor way to move around a 2500px canvas: there is no handle that
// tells you where you are, and dragging the page body does nothing because the
// scroll container is an inner element.
//
// This pans by writing scrollLeft/scrollTop rather than by transforming the SVG.
// That matters: every position in layout.js and render.js is absolute canvas
// coordinate, and a transform would have to be composed with all of them. The
// scroll container is already the thing that moves, so we just drive it.

const DRAG_THRESHOLD = 4; // px before a press counts as a drag, not a click

export function makeDraggable(wrap, { onDragStart, onDragEnd } = {}) {
  let dragging = false;
  let armed = false;
  let justDragged = false; // still true when the click event follows pointerup
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  wrap.addEventListener("pointerdown", (e) => {
    // The panels, buttons and links sit above the canvas and keep their behaviour.
    if (e.target.closest(".panel, button, a")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    armed = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = wrap.scrollLeft;
    startTop = wrap.scrollTop;
  });

  wrap.addEventListener("pointermove", (e) => {
    if (!armed) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      dragging = true;
      // Capture the pointer so the drag survives the cursor leaving the element,
      // and so we can tell at pointerup whether this was a drag or a click.
      wrap.setPointerCapture(e.pointerId);
      wrap.classList.add("dragging");
      onDragStart?.();
    }
    e.preventDefault();
    wrap.scrollLeft = startLeft - dx;
    wrap.scrollTop = startTop - dy;
  });

  const end = (e) => {
    if (!armed) return;
    armed = false;
    if (!dragging) return;
    dragging = false;
    justDragged = true;
    wrap.classList.remove("dragging");
    if (wrap.hasPointerCapture?.(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
    onDragEnd?.();
    // click fires after pointerup in the same task, so clear on the next one.
    setTimeout(() => { justDragged = false; }, 0);
  };

  wrap.addEventListener("pointerup", end);
  wrap.addEventListener("pointercancel", end);

  // A drag that ends over a node would otherwise deliver its click and open the
  // detail panel for a node the reader did not mean to select.
  wrap.addEventListener("click", (e) => {
    if (!justDragged) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  return { get isDragging() { return dragging; } };
}
