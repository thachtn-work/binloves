import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Media, Product } from '../../lib/types';
import { Field, Fieldset } from '../../components/ui';
import { MediaThumb } from '../../media/MediaThumb';

/** One row of the grid. Prices are the raw input strings, like the rest of the form. */
export interface VariantRow {
  option1Value: string;
  /** Empty string when the product has only one option group. */
  option2Value: string;
  price: string;
  salePrice: string;
  stockLabel: string;
  isActive: boolean;
}

const rowKey = (first: string, second: string) => `${first}\u0000${second}`;

/** Distinct values in the order the rows already hold them. */
function distinct(rows: VariantRow[], pick: (row: VariantRow) => string): string[] {
  const seen: string[] = [];
  for (const row of rows) {
    const value = pick(row);
    if (value && !seen.includes(value)) seen.push(value);
  }
  return seen;
}

export const valuesOfGroup1 = (rows: VariantRow[]) => distinct(rows, (r) => r.option1Value);
export const valuesOfGroup2 = (rows: VariantRow[]) => distinct(rows, (r) => r.option2Value);

/**
 * Rebuilds the grid for a new set of option values, carrying over what the
 * owner already typed for combinations that still exist.
 *
 * This is the whole point of regenerating rather than editing rows in place:
 * adding a fourth colour to a product with twelve filled-in prices must not
 * ask for those twelve prices again.
 *
 * `defaultPrice` seeds the rows that are genuinely new. Converting the
 * existing catalogue is the common case — a product already priced at 500.000đ
 * gets option groups, and every combination starts at the price it has been
 * selling at. Without it, ticking the box throws that number away and the
 * owner retypes it once per row, 43 products over.
 */
export function rebuildRows(
  first: string[],
  second: string[],
  existing: VariantRow[],
  defaultPrice = '',
): VariantRow[] {
  const kept = new Map(existing.map((row) => [rowKey(row.option1Value, row.option2Value), row]));
  const seconds = second.length ? second : [''];
  const rows: VariantRow[] = [];
  for (const one of first) {
    for (const two of seconds) {
      rows.push(
        kept.get(rowKey(one, two)) ?? {
          option1Value: one,
          option2Value: two,
          price: defaultPrice,
          salePrice: '',
          stockLabel: '',
          isActive: true,
        },
      );
    }
  }
  return rows;
}

interface ChipsProps {
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}

function ValueChips({ label, hint, placeholder, values, onChange }: ChipsProps) {
  const [draft, setDraft] = useState('');

  function add() {
    // Commas split so a whole set can be pasted in one go — the owner is
    // usually copying "10ml, 30ml, 50ml" out of a supplier message.
    const added = draft
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part && !values.includes(part));
    if (added.length) onChange([...values, ...added]);
    setDraft('');
  }

  return (
    <Field label={label} hint={hint}>
      <div className="optvalues">
        {values.map((value) => (
          <span className="optchip" key={value}>
            {value}
            <button
              type="button"
              className="optchip__x"
              aria-label={`Bỏ ${value}`}
              onClick={() => onChange(values.filter((v) => v !== value))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="input optvalues__input"
          value={draft}
          // Once a value is in, repeating one as placeholder reads as "already
          // typed" and the owner stops adding.
          placeholder={values.length ? 'Thêm lựa chọn…' : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              // Enter inside a form would submit the product instead.
              e.preventDefault();
              add();
            }
          }}
        />
      </div>
    </Field>
  );
}

/** Everything this editor can change about the product. Partial: most edits touch one field. */
interface Patch {
  option1Name?: string;
  option2Name?: string;
  variants?: VariantRow[];
  optionImageGroup?: number | null;
  optionImages?: Record<string, string>;
}

interface Props {
  option1Name: string;
  option2Name: string;
  variants: VariantRow[];
  /** The product's single price, used to seed newly generated rows. */
  basePrice: string;
  /** Which group's values carry a photo — 1, 2, or null for none. */
  optionImageGroup: number | null;
  /** value → media id, for the group above. */
  optionImages: Record<string, string>;
  /** The product's gallery. A per-value photo has to be one of these. */
  galleryIds: string[];
  onChange: (patch: Patch) => void;
}

export function VariantEditor({
  option1Name,
  option2Name,
  variants,
  basePrice,
  optionImageGroup,
  optionImages,
  galleryIds,
  onChange,
}: Props) {
  const [on, setOn] = useState(variants.length > 0 || option1Name !== '');
  const [secondGroup, setSecondGroup] = useState(option2Name !== '');
  const [bulk, setBulk] = useState('');
  /** The value whose photo is being chosen, or null when the picker is closed. */
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  // Shares the list page's cache, so this costs no extra request. Reusing a
  // name the catalogue already has is what keeps "Dung tích" from becoming
  // three different spellings across 43 products.
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });
  const usedNames = [
    ...new Set(
      (products ?? []).flatMap((p) => [p.option1Name, p.option2Name]).filter((n): n is string => !!n),
    ),
  ];

  // Already in the cache behind the gallery picker further up the same form.
  const { data: library } = useQuery({
    queryKey: ['media'],
    queryFn: async () => (await api.get<Media[]>('/media')).data,
  });
  const mediaById = new Map((library ?? []).map((m) => [m.id, m]));

  const first = valuesOfGroup1(variants);
  const second = valuesOfGroup2(variants);

  // Clips are left out: this is a swatch on a 24px chip, and a video there
  // arrives as a dead first frame.
  const galleryImages = galleryIds
    .map((id) => mediaById.get(id))
    .filter((m): m is Media => m?.mediaType === 'image');
  const imageValues = optionImageGroup === 1 ? first : optionImageGroup === 2 ? second : [];

  const assign = (value: string, mediaId: string | null) => {
    const next = { ...optionImages };
    if (mediaId === null) delete next[value];
    else next[value] = mediaId;
    onChange({ optionImages: next });
  };

  const setRows = (f: string[], s: string[]) =>
    onChange({ option1Name, option2Name, variants: rebuildRows(f, s, variants, basePrice) });

  function patchRow(index: number, patch: Partial<VariantRow>) {
    onChange({
      option1Name,
      option2Name,
      variants: variants.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  function toggle(next: boolean) {
    setOn(next);
    if (!next) {
      setSecondGroup(false);
      onChange({
        option1Name: '',
        option2Name: '',
        variants: [],
        optionImageGroup: null,
        optionImages: {},
      });
    }
  }

  return (
    <Fieldset
      title="Phân loại"
      hint="Dùng khi một sản phẩm có nhiều lựa chọn khác giá — dung tích, size, màu. Không có thì bỏ qua."
    >
      <label className="checkline">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
        Sản phẩm này có nhiều phân loại
      </label>

      {on && (
        <>
          <datalist id="optnames">
            {usedNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <Field label="Tên nhóm 1" hint='Bạn tự đặt, ví dụ "Dung tích", "Size dài", "Màu".'>
            <input
              className="input"
              list="optnames"
              value={option1Name}
              placeholder="Dung tích"
              onChange={(e) => onChange({ option1Name: e.target.value, option2Name, variants })}
            />
          </Field>

          <ValueChips
            label="Các lựa chọn của nhóm 1"
            hint="Gõ xong nhấn Enter. Nhập nhiều cái một lúc thì ngăn bằng dấu phẩy."
            placeholder="10ml"
            values={first}
            onChange={(next) => setRows(next, second)}
          />

          <label className="checkline">
            <input
              type="checkbox"
              checked={secondGroup}
              onChange={(e) => {
                setSecondGroup(e.target.checked);
                if (!e.target.checked) {
                  onChange({
                    option2Name: '',
                    variants: rebuildRows(first, [], variants, basePrice),
                    // The photos were attached to values this product no
                    // longer has.
                    ...(optionImageGroup === 2 ? { optionImageGroup: null, optionImages: {} } : {}),
                  });
                }
              }}
            />
            Có thêm nhóm thứ hai
          </label>

          {secondGroup && (
            <>
              <Field label="Tên nhóm 2" hint='Ví dụ "Màu".'>
                <input
                  className="input"
                  list="optnames"
                  value={option2Name}
                  placeholder="Màu"
                  onChange={(e) => onChange({ option1Name, option2Name: e.target.value, variants })}
                />
              </Field>

              <ValueChips
                label="Các lựa chọn của nhóm 2"
                hint="Gõ xong nhấn Enter."
                placeholder="Đỏ"
                values={second}
                onChange={(next) => setRows(first, next)}
              />
            </>
          )}

          {variants.length > 0 && (
            <>
              <Field
                label="Ảnh riêng cho từng lựa chọn"
                hint="Khách bấm lựa chọn nào thì website hiện đúng ảnh đó. Chỉ chọn được trong các ảnh đã thêm ở mục “Ảnh & video” bên trên."
              >
                <select
                  className="select"
                  value={optionImageGroup ?? ''}
                  onChange={(e) => {
                    const next = e.target.value === '' ? null : Number(e.target.value);
                    // The two groups hold different words, so an old map would
                    // only carry entries that now match nothing.
                    onChange({ optionImageGroup: next, optionImages: {} });
                  }}
                >
                  <option value="">— Không có ảnh riêng —</option>
                  <option value="1">{option1Name || 'Nhóm 1'}</option>
                  {secondGroup && <option value="2">{option2Name || 'Nhóm 2'}</option>}
                </select>
              </Field>

              {optionImageGroup !== null && (
                <div className="optimg">
                  {imageValues.map((value) => {
                    const media = mediaById.get(optionImages[value] ?? '');
                    return (
                      <div className="optimg__row" key={value}>
                        {media ? (
                          <MediaThumb media={media} className="optimg__thumb" />
                        ) : (
                          <span className="optimg__thumb optimg__thumb--empty" aria-hidden="true" />
                        )}
                        <span className="optimg__value">{value}</span>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => setPickerFor(value)}
                        >
                          {media ? 'Đổi ảnh' : 'Chọn ảnh'}
                        </button>
                        {media && (
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => assign(value, null)}
                          >
                            Bỏ
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {pickerFor !== null && (
                <div
                  className="modal-backdrop"
                  role="dialog"
                  aria-modal="true"
                  onClick={() => setPickerFor(null)}
                >
                  <div className="modal" onClick={(e) => e.stopPropagation()}>
                    <h2 className="modal__title">Ảnh cho “{pickerFor}”</h2>
                    {galleryImages.length === 0 ? (
                      <p className="modal__body">
                        Sản phẩm này chưa có ảnh nào. Thêm ảnh ở mục “Ảnh &amp; video” bên trên rồi
                        quay lại đây.
                      </p>
                    ) : (
                      <div className="optimg__grid">
                        {galleryImages.map((m) => (
                          <button
                            type="button"
                            key={m.id}
                            className={
                              optionImages[pickerFor] === m.id
                                ? 'optimg__pick optimg__pick--on'
                                : 'optimg__pick'
                            }
                            aria-label={m.filename}
                            onClick={() => {
                              assign(pickerFor, m.id);
                              setPickerFor(null);
                            }}
                          >
                            <MediaThumb media={m} />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="modal__actions">
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => setPickerFor(null)}
                      >
                        Đóng
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{option1Name || 'Nhóm 1'}</th>
                      {secondGroup && <th>{option2Name || 'Nhóm 2'}</th>}
                      <th>Giá (đ)</th>
                      <th>Giá KM (đ)</th>
                      <th>Ghi chú số lượng</th>
                      <th>Bán</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((row, index) => {
                      const saleTooHigh =
                        row.price !== '' &&
                        row.salePrice !== '' &&
                        Number(row.salePrice) >= Number(row.price);
                      return (
                        <tr
                          key={rowKey(row.option1Value, row.option2Value)}
                          className={row.isActive ? undefined : 'variantrow--off'}
                        >
                          <td>{row.option1Value}</td>
                          {secondGroup && <td>{row.option2Value}</td>}
                          <td>
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="1000"
                              value={row.price}
                              onChange={(e) => patchRow(index, { price: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="1000"
                              value={row.salePrice}
                              aria-invalid={saleTooHigh}
                              title={saleTooHigh ? 'Giá khuyến mãi phải nhỏ hơn giá gốc.' : undefined}
                              onChange={(e) => patchRow(index, { salePrice: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              className="input"
                              value={row.stockLabel}
                              placeholder="Theo sản phẩm"
                              onChange={(e) => patchRow(index, { stockLabel: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={row.isActive}
                              aria-label={`Bán ${row.option1Value} ${row.option2Value}`}
                              onChange={(e) => patchRow(index, { isActive: e.target.checked })}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="bulkprice">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1000"
                  value={bulk}
                  placeholder="Giá áp cho tất cả"
                  onChange={(e) => setBulk(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  disabled={bulk === ''}
                  onClick={() => {
                    onChange({
                      option1Name,
                      option2Name,
                      variants: variants.map((row) => ({ ...row, price: bulk })),
                    });
                    setBulk('');
                  }}
                >
                  Áp dụng cho tất cả
                </button>
              </div>

              <p className="field__hint">
                Bỏ tick “Bán” là phân loại đó không hiện ngoài website. Ghi chú số lượng để trống
                thì lấy theo ghi chú chung của sản phẩm.
              </p>
            </>
          )}
        </>
      )}
    </Fieldset>
  );
}
