/**
 * Ordering lives on the list, where the user can see what moves where.
 * Replaces the old hand-typed position number, which asked the shop owner to
 * reason about numbers instead of just pointing at a row.
 */
export function OrderButtons({
  index,
  total,
  disabled,
  onMove,
}: {
  index: number;
  total: number;
  disabled?: boolean;
  onMove: (from: number, to: number) => void;
}) {
  return (
    <div className="order-cell">
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
