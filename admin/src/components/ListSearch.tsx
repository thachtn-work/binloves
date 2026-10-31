/**
 * Sits in the page header next to the "add" button rather than on its own row
 * above the table, so turning on search costs no vertical space and the table
 * stays where the eye expects it.
 *
 * The result count lives in the page header's hint line (see each list page),
 * for the same reason.
 *
 * Filters the rows already on screen — no request, no loading state, results
 * update as you type. The lists here are small enough for that to stay
 * instant; past a few hundred products this should move to the server with
 * pagination.
 */
export function ListSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="listsearch">
      <span className="listsearch__icon" aria-hidden="true">
        ⌕
      </span>
      <input
        type="search"
        className="input listsearch__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          className="listsearch__clear"
          onClick={() => onChange('')}
          aria-label="Xoá từ khoá"
        >
          ×
        </button>
      )}
    </div>
  );
}
