import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Category, Product } from '../../lib/types';
import { Field, Fieldset, slugify } from '../../components/ui';
import { MediaPicker } from '../../media/MediaPicker';
import { isoToVnInput, vnInputToIso } from '../../lib/vn-time';
import { VariantEditor, type VariantRow } from './VariantEditor';

export interface ProductFormValues {
  name: string;
  slug: string;
  description: string;
  price: string;
  salePrice: string;
  /** Vietnam wall clock, exactly as the datetime input holds it. */
  saleStartsAt: string;
  saleEndsAt: string;
  stockLabel: string;
  categoryId: string;
  mediaIds: string[];
  isActive: boolean;
  option1Name: string;
  option2Name: string;
  variants: VariantRow[];
  /** Which group's values carry a photo — 1, 2, or null for none. */
  optionImageGroup: number | null;
  /** value → media id, for the group above. Kept as a map so renaming a value elsewhere cannot desync an index. */
  optionImages: Record<string, string>;
}

export function emptyProduct(): ProductFormValues {
  return {
    name: '',
    slug: '',
    description: '',
    price: '',
    salePrice: '',
    saleStartsAt: '',
    saleEndsAt: '',
    stockLabel: '',
    categoryId: '',
    mediaIds: [],
    isActive: true,
    option1Name: '',
    option2Name: '',
    variants: [],
    optionImageGroup: null,
    optionImages: {},
  };
}

export function productToValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    slug: product.slug,
    description: product.description ?? '',
    price: product.price ?? '',
    salePrice: product.salePrice ?? '',
    saleStartsAt: isoToVnInput(product.saleStartsAt),
    saleEndsAt: isoToVnInput(product.saleEndsAt),
    stockLabel: product.stockLabel ?? '',
    categoryId: product.categoryId ?? '',
    mediaIds: [...product.media].sort((a, b) => a.sortOrder - b.sortOrder).map((m) => m.mediaId),
    isActive: product.isActive,
    option1Name: product.option1Name ?? '',
    option2Name: product.option2Name ?? '',
    variants: [...product.variants]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((v) => ({
        option1Value: v.option1Value,
        option2Value: v.option2Value ?? '',
        price: v.price ?? '',
        salePrice: v.salePrice ?? '',
        stockLabel: v.stockLabel ?? '',
        isActive: v.isActive,
      })),
    optionImageGroup: product.optionImageGroup,
    optionImages: Object.fromEntries(product.optionImages.map((i) => [i.value, i.mediaId])),
  };
}

/** True once the product sells by combination rather than at one price. */
export const hasVariants = (values: ProductFormValues) => values.variants.length > 0;

/** Whether any price on this product is discounted, wherever that price lives. */
export const hasSalePrice = (values: ProductFormValues) =>
  hasVariants(values)
    ? values.variants.some((v) => v.salePrice !== '')
    : values.salePrice !== '';

/** Strips empty strings so the API receives nulls/omissions, not "". */
/**
 * The per-value photos that still make sense, as the API wants them.
 *
 * Both filters matter. A value the owner has since removed from the grid, and
 * an image they have since taken out of the gallery, would each be rejected by
 * the server — and the form would be refused for something the owner cannot
 * see on screen any more.
 */
function optionImagesToPayload(values: ProductFormValues, group: number | null) {
  if (group === null) return [];
  const groupValues = new Set(
    values.variants
      .map((v) => (group === 1 ? v.option1Value : v.option2Value))
      .filter((v) => v !== ''),
  );
  const gallery = new Set(values.mediaIds);
  return Object.entries(values.optionImages)
    .filter(([value, mediaId]) => groupValues.has(value) && gallery.has(mediaId))
    .map(([value, mediaId]) => ({ value, mediaId }));
}

export function valuesToPayload(values: ProductFormValues) {
  const variants = hasVariants(values);
  // No option groups means nothing to hang a photo on.
  const imageGroup = variants ? values.optionImageGroup : null;
  // With option groups the price lives on the rows, so the product's own price
  // is cleared rather than left behind: a stale number sitting under a grid is
  // invisible in the form and would surface the day the groups are removed.
  const salePrice = variants ? null : values.salePrice === '' ? null : Number(values.salePrice);
  const onSale = hasSalePrice(values);

  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    description: values.description.trim() || undefined,
    price: variants ? null : values.price === '' ? undefined : Number(values.price),
    salePrice,
    // No sale price anywhere clears the window too. Leaving the dates behind
    // would mean the next sale on this product silently inherits the schedule
    // of the last one — and the server rejects a window with no price anyway.
    saleStartsAt: onSale ? vnInputToIso(values.saleStartsAt) : null,
    saleEndsAt: onSale ? vnInputToIso(values.saleEndsAt) : null,
    stockLabel: values.stockLabel.trim() || undefined,
    categoryId: values.categoryId || undefined,
    mediaIds: values.mediaIds,
    isActive: values.isActive,
    option1Name: variants ? values.option1Name.trim() || null : null,
    option2Name: variants && values.option2Name.trim() ? values.option2Name.trim() : null,
    variants: values.variants.map((v) => ({
      option1Value: v.option1Value,
      option2Value: v.option2Value || null,
      price: v.price === '' ? null : Number(v.price),
      salePrice: v.salePrice === '' ? null : Number(v.salePrice),
      stockLabel: v.stockLabel.trim() || null,
      isActive: v.isActive,
    })),
    optionImageGroup: imageGroup,
    optionImages: optionImagesToPayload(values, imageGroup),
  };
}

interface Props {
  values: ProductFormValues;
  onChange: (values: ProductFormValues) => void;
  /** True while editing: the slug is a live URL and shouldn't silently move. */
  lockSlug?: boolean;
}

export function ProductForm({ values, onChange, lockSlug = false }: Props) {
  const [slugTouched, setSlugTouched] = useState(lockSlug);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/categories')).data,
  });

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  function onNameChange(name: string) {
    // Auto-fill the slug while it's untouched, so the shop owner never has to
    // think about URLs — but stop the moment they edit it themselves.
    onChange({ ...values, name, slug: slugTouched ? values.slug : slugify(name) });
  }

  const variants = hasVariants(values);
  const onSale = hasSalePrice(values);

  const saleTooHigh =
    values.price !== '' && values.salePrice !== '' && Number(values.salePrice) >= Number(values.price);

  // Both are Vietnam wall clock in the same format, so comparing the strings
  // is the same comparison as comparing the instants — and avoids parsing a
  // half-typed date on every keystroke.
  const windowBackwards =
    values.saleStartsAt !== '' &&
    values.saleEndsAt !== '' &&
    values.saleEndsAt <= values.saleStartsAt;

  return (
    <div className="card">
      <Fieldset title="Thông tin cơ bản" hint="Tên và mô tả khách nhìn thấy trên website.">
        <Field label="Tên sản phẩm">
          <input
            className="input"
            value={values.name}
            onChange={(e) => onNameChange(e.target.value)}
            required
            autoFocus={!lockSlug}
          />
        </Field>

        <Field
          label="Đường dẫn"
          hint={
            lockSlug
              ? 'Đổi đường dẫn sẽ làm hỏng các liên kết cũ đã chia sẻ cho khách.'
              : 'Tự điền theo tên. Chỉ dùng chữ thường, số và dấu gạch ngang.'
          }
        >
          <input
            className="input"
            value={values.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set('slug', e.target.value);
            }}
            required
          />
        </Field>

        <Field label="Danh mục">
          <select
            className="select"
            value={values.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
          >
            <option value="">— Chưa phân loại —</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Mô tả" hint="Mỗi dòng sẽ hiển thị thành một đoạn riêng.">
          <textarea
            className="textarea"
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
      </Fieldset>

      <Fieldset
        title="Ảnh & video"
        hint="Mục đầu tiên là ảnh đại diện hiển thị ở trang chủ và danh mục."
      >
        <MediaPicker value={values.mediaIds} onChange={(ids) => set('mediaIds', ids)} />
      </Fieldset>

      <VariantEditor
        option1Name={values.option1Name}
        option2Name={values.option2Name}
        variants={values.variants}
        basePrice={values.price}
        optionImageGroup={values.optionImageGroup}
        optionImages={values.optionImages}
        galleryIds={values.mediaIds}
        onChange={(patch) => onChange({ ...values, ...patch })}
      />

      <Fieldset
        title="Giá & số lượng hiển thị"
        hint={
          variants
            ? 'Giá nhập ở bảng phân loại bên trên. Ngoài website khách thấy khoảng giá, chọn phân loại rồi mới ra giá cụ thể.'
            : 'Các con số này chỉ để hiển thị cho khách xem. Hệ thống không tự trừ kho khi bán.'
        }
      >
        {!variants && (
        <div className="grid2">
          <Field label="Giá gốc (đ)">
            <input
              className="input"
              type="number"
              min="0"
              step="1000"
              value={values.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </Field>

          <Field
            label="Giá khuyến mãi (đ)"
            hint="Để trống nếu không giảm giá."
            error={saleTooHigh ? 'Giá khuyến mãi phải nhỏ hơn giá gốc.' : undefined}
          >
            <input
              className="input"
              type="number"
              min="0"
              step="1000"
              value={values.salePrice}
              onChange={(e) => set('salePrice', e.target.value)}
              aria-invalid={saleTooHigh}
            />
          </Field>
        </div>
        )}

        {/*
          Only once something is discounted — the product's own sale price, or
          any row in the variant grid. An empty window on a product that is not
          discounted is two more fields to scroll past on every edit, and the
          server rejects that combination anyway.
        */}
        {onSale && (
          <>
            <div className="grid2">
              <Field
                label="Bắt đầu giảm giá"
                hint="Để trống = giảm ngay."
                error={windowBackwards ? ' ' : undefined}
              >
                <input
                  className="input"
                  type="datetime-local"
                  step="1"
                  value={values.saleStartsAt}
                  onChange={(e) => set('saleStartsAt', e.target.value)}
                />
              </Field>

              <Field
                label="Kết thúc giảm giá"
                hint="Để trống = giảm đến khi bạn tự bỏ."
                error={
                  windowBackwards
                    ? 'Thời gian kết thúc phải sau thời gian bắt đầu.'
                    : undefined
                }
              >
                <input
                  className="input"
                  type="datetime-local"
                  step="1"
                  value={values.saleEndsAt}
                  onChange={(e) => set('saleEndsAt', e.target.value)}
                  aria-invalid={windowBackwards}
                />
              </Field>
            </div>

            <p className="field__hint">
              Giờ Việt Nam. Hết giờ kết thúc, website tự quay về giá gốc — bạn không cần
              vào xoá. Giá khuyến mãi vẫn được giữ lại để lần sau chạy tiếp khỏi nhập lại.
              {variants && ' Khoảng thời gian này áp cho mọi phân loại đang có giá khuyến mãi.'}
            </p>
          </>
        )}

        <Field
          label="Ghi chú số lượng"
          hint='Bạn tự nhập và tự cập nhật, ví dụ "Còn 3 cái" hoặc "Hết hàng".'
        >
          <input
            className="input"
            value={values.stockLabel}
            onChange={(e) => set('stockLabel', e.target.value)}
          />
        </Field>
      </Fieldset>

      <Fieldset title="Hiển thị" hint="Sản phẩm đang ẩn sẽ không xuất hiện trên website.">
        <label className="checkline">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
          />
          Hiện sản phẩm này trên website
        </label>
      </Fieldset>
    </div>
  );
}
