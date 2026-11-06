import { GripVertical } from 'lucide-react';
import type { GripProps } from './useRowDrag';

/**
 * Ordering lives on the list, where the user can see what moves where.
 * Replaces the old hand-typed position number, which asked the shop owner to
 * reason about numbers instead of just pointing at a row.
 *
 * The grip and the arrows share one cell because they answer one question --
 * where does this row go -- in two ways. Dragging is the fast way and the one
 * a hand reaches for; the arrows are the only way in from a keyboard, and the
 * only sane way to move a row one place in a list of hundreds, where dragging
 * means holding a button down across half a screen of scrolling.
 *
 * The grip is six dots in two columns, the shape this control has everywhere
 * else. It used to be the braille glyph U+283F, which is the same six dots in
 * principle and in practice whatever the reader's font decided: on a machine
 * without a font covering that block it renders as a box, and a box is not
 * something anyone grabs.
 */
export function OrderButtons({
  index,
  total,
  disabled,
  onMove,
  grip,
}: {
  index: number;
  total: number;
  disabled?: boolean;
  onMove: (from: number, to: number) => void;
  /** From `useRowDrag().gripProps(item)`. Left out, the cell is arrows only. */
  grip?: GripProps;
}) {
  return (
    <div className="order-cell">
      {grip && (
        <span
          className="draghandle"
          role="button"
          // -1, not 0: Tab already stops on the two arrows beside it, which do
          // the same job from a keyboard. A third stop that a keyboard cannot
          // use would be a trap, not an affordance.
          tabIndex={-1}
          aria-label="Kéo để đổi thứ tự"
          title="Kéo để đổi thứ tự"
          {...grip}
        >
          <GripVertical size={15} aria-hidden="true" />
        </span>
      )}
      <button
        type="button"
        className="iconbtn"
        onClick={() => onMove(index, index - 1)}
        disabled={disabled || index === 0}
        aria-label="Chuyển lên trên"
        title="Chuyển lên trên"
      >
        ↑
      </button>
      <button
        type="button"
        className="iconbtn"
        onClick={() => onMove(index, index + 1)}
        disabled={disabled || index === total - 1}
        aria-label="Chuyển xuống dưới"
        title="Chuyển xuống dưới"
      >
        ↓
      </button>
    </div>
  );
}

/** Returns a new array with the item at `from` moved to `to`. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
