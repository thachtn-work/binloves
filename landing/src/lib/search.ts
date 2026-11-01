/*
  Folding for search, shared by the page that builds the index and the script
  that matches against it — the two have to agree exactly or a typed word will
  miss a product whose name contains it.

  Vietnamese is the whole reason this exists. Phone keyboards make accents
  slow, so people type "am dao" and expect "âm đạo"; `đ` has to be handled on
  its own because it is a letter in its own right rather than a `d` wearing a
  mark, and NFD leaves it untouched.
*/
export function searchKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    // Everything that is not a letter or a digit becomes a gap, so a name
    // written "Trứng Rung – APP" is reachable by typing "trung rung app".
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
