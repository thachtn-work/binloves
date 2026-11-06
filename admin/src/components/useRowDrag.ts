import { useEffect, useRef, useState } from 'react';

type Edge = 'before' | 'after';
type Target = { key: string; edge: Edge };

/** What `gripProps` hands back: spread onto the thing the user grabs. */
export type GripProps = {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  style: { touchAction: 'none'; opacity: number };
  'aria-disabled': true | undefined;
};

/**
 * The nearest ancestor that scrolls vertically, or null when only the page
 * does. `clientHeight + 1` rather than `clientHeight` because sub-pixel
 * heights make a box that does not scroll look like one that scrolls by a
 * fraction of a pixel.
 */
function scrollableAncestor(start: Element | null): Element | null {
  for (let node = start; node; node = node.parentElement) {
    if (node === document.body || node === document.documentElement) break;
    const overflowY = window.getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
  }
  return null;
}

/**
 * Row reordering by dragging a grip.
 *
 * Built on pointer events rather than HTML5 drag-and-drop, which never fires
 * on a touchscreen: the shop owner working from an iPad would have seen a grip
 * that did nothing. One set of handlers now covers mouse, pen and finger
 * alike, which is less code than the two paths the alternative needed.
 *
 * The indicator tracks the pointer's half of the row rather than sitting on
 * one fixed edge. A fixed edge would be wrong half the time: a row dragged
 * downwards lands after the row under the pointer, upwards lands before — so a
 * line that always drew above would promise the wrong position on every
 * downward drag. Line and result come from the same value, so what it shows is
 * what happens.
 *
 * It scrolls the page when the pointer nears an edge. Without that a list
 * taller than the window can only be rearranged within whatever happens to be
 * on screen: measured on a 19-row category, dragging the last row to the top
 * reached position 9 and stopped, because every row above was past the fold
 * and never became a target.
 *
 * Dragging is the shortcut, not the only way in — the up/down arrows remain,
 * and they are what makes this reachable from a keyboard.
 */
export function useRowDrag<T>(
  items: T[],
  keyOf: (item: T) => string,
  onCommit: (ids: string[]) => void,
  /**
   * Set while a previous move is still saving. A second drag started before
   * the list refetches would be computed against the order on screen, which
   * is the one from before the first move — and committing that would quietly
   * undo it.
   */
  busy = false,
) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);

  // Read by the loop below. Refs, not state: the pointer moves far more often
  // than the row under it changes, and re-rendering the table on every pixel
  // would make the drag stutter.
  const point = useRef({ x: 0, y: 0 });
  const draggingRef = useRef<string | null>(null);
  const targetRef = useRef<Target | null>(null);

  function locate(): Target | null {
    const { x, y } = point.current;
    const row = (document.elementFromPoint(x, y) as Element | null)?.closest('[data-row-key]');
    const key = row?.getAttribute('data-row-key');
    if (!row || !key || key === draggingRef.current) return null;
    const box = row.getBoundingClientRect();
    return { key, edge: y < box.top + box.height / 2 ? 'before' : 'after' };
  }

  useEffect(() => {
    if (!dragging) return;

    const EDGE = 90; // how close to the edge before the page starts moving
    const SPEED = 14; // pixels per frame at the very edge
    let frame = 0;

    const step = () => {
      const { x, y } = point.current;

      /*
        Scroll whatever the rows are actually inside.

        The window is the right answer for a table on a page, and the wrong one
        for the collection picker, whose chosen list is a 400px box with its
        own scrollbar: there the page does not move at all, so a row could only
        be dragged as far as the six or seven rows on screen. Falling back to
        the window keeps every table behaving as before.
      */
      const box = scrollableAncestor(document.elementFromPoint(x, y));
      if (box) {
        const r = box.getBoundingClientRect();
        // A short box needs a short trigger zone, or the two zones meet in the
        // middle and the list scrolls wherever the pointer is.
        const edge = Math.min(EDGE, r.height / 4);
        const toTop = y - r.top - edge;
        const toBottom = r.bottom - edge - y;
        if (toTop < 0) box.scrollTop += Math.max(-SPEED, toTop / 5);
        else if (toBottom < 0) box.scrollTop += Math.min(SPEED, -toBottom / 5);
      } else {
        const toTop = y - EDGE;
        const toBottom = window.innerHeight - EDGE - y;
        if (toTop < 0) window.scrollBy(0, Math.max(-SPEED, toTop / 5));
        else if (toBottom < 0) window.scrollBy(0, Math.min(SPEED, -toBottom / 5));
      }

      // Recomputed every frame, not only on pointermove: while the page
      // auto-scrolls under a stationary finger the row beneath it keeps
      // changing, and the line has to follow.
      const next = locate();
      const now = targetRef.current;
      if (next?.key !== now?.key || next?.edge !== now?.edge) {
        targetRef.current = next;
        setTarget(next);
      }

      frame = requestAnimationFrame(step);
    };

    // Escape abandons the drag. Nothing else here listens for it, and a
    // pointer that is already captured will not fire pointercancel just
    // because a key was pressed, so without this the only way out of a drag
    // started by mistake is to drop it somewhere harmless and undo by hand.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish(false);
    };
    window.addEventListener('keydown', onKey);

    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [dragging]);

  function finish(commit: boolean) {
    const from = draggingRef.current;
    const to = targetRef.current;
    if (commit && from && to) {
      const rest = items.map(keyOf).filter((k) => k !== from);
      const at = rest.indexOf(to.key);
      if (at !== -1) {
        rest.splice(to.edge === 'before' ? at : at + 1, 0, from);
        onCommit(rest);
      }
    }
    draggingRef.current = null;
    targetRef.current = null;
    setDragging(null);
    setTarget(null);
  }

  return {
    dragging,

    /** Spread onto the row element. */
    rowProps(item: T) {
      const key = keyOf(item);
      const mine = target?.key === key && dragging !== key ? target.edge : null;
      return {
        'data-row-key': key,
        className: [
          dragging === key ? 'row-dragging' : '',
          mine === 'before' ? 'row-drop-before' : '',
          mine === 'after' ? 'row-drop-after' : '',
        ]
          .filter(Boolean)
          .join(' '),
      };
    },

    /** Spread onto the grip inside the row. Only the grip starts a drag, so
     *  the buttons in the row stay clickable and text stays selectable. */
    gripProps(item: T): GripProps {
      const key = keyOf(item);
      return {
        onPointerDown: (event: React.PointerEvent) => {
          if (busy) return;
          // Without this a finger scrolls the page instead of dragging.
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          point.current = { x: event.clientX, y: event.clientY };
          draggingRef.current = key;
          setDragging(key);
        },
        onPointerMove: (event: React.PointerEvent) => {
          if (!draggingRef.current) return;
          point.current = { x: event.clientX, y: event.clientY };
        },
        onPointerUp: () => finish(true),
        onPointerCancel: () => finish(false),
        style: { touchAction: 'none' as const, opacity: busy ? 0.35 : 1 },
        'aria-disabled': busy || undefined,
      };
    },
  };
}
