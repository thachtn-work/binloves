import { useState } from 'react';
import { Field, Fieldset, slugify } from '../../components/ui';
import { MediaPicker } from '../../media/MediaPicker';
import type { Collection } from '../../lib/types';

export interface CollectionFormValues {
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  coverMediaId: string | null;
}

export function emptyCollection(): CollectionFormValues {
  return { name: '', slug: '', description: '', isActive: true, coverMediaId: null };
}

export function collectionToValues(collection: Collection): CollectionFormValues {
  return {
    name: collection.name,
    slug: collection.slug,
    description: collection.description ?? '',
    isActive: collection.isActive,
    coverMediaId: collection.coverMediaId,
  };
}

// No sortOrder: position is set with the arrows on the list.
export function collectionPayload(values: CollectionFormValues) {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    description: values.description.trim() || undefined,
    isActive: values.isActive,
    coverMediaId: values.coverMediaId,
  };
}

export function CollectionForm({
  values,
  onChange,
  lockSlug = false,
}: {
  values: CollectionFormValues;
  onChange: (values: CollectionFormValues) => void;
  lockSlug?: boolean;
}) {
  const [slugTouched, setSlugTouched] = useState(lockSlug);

  function set<K extends keyof CollectionFormValues>(key: K, value: CollectionFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="card">
      <Fieldset
        title="Thông tin bộ sưu tập"
        hint="Mỗi bộ sưu tập là một khu vực riêng trên trang chủ, ví dụ “Hàng mới về”."
      >
        <Field label="Tên bộ sưu tập">
          <input
            className="input"
            value={values.name}
            onChange={(e) =>
              onChange({
                ...values,
                name: e.target.value,
                slug: slugTouched ? values.slug : slugify(e.target.value),
              })
            }
            required
            autoFocus
          />
        </Field>

        <Field
          label="Đường dẫn"
          hint={lockSlug ? 'Đổi đường dẫn sẽ làm hỏng các liên kết cũ.' : 'Tự điền theo tên.'}
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

        <Field label="Mô tả ngắn" hint="Hiển thị dưới tiêu đề khu vực trên trang chủ.">
          <textarea
            className="textarea"
            style={{ minHeight: 80 }}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
      </Fieldset>

      <Fieldset title="Hiển thị">
        <label className="checkline">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
          />
          Hiện bộ sưu tập này trên trang chủ
        </label>
      </Fieldset>

      {/* Last, because the picker carries a scrolling library: above the
          checkbox it would bury the one toggle on this form. Optional by
          design — left empty the site shows the first photo of the first
          product inside. */}
      <Fieldset
        title="Ảnh đại diện"
        hint={
          values.coverMediaId
            ? 'Ảnh này hiện ở mục "Bộ sưu tập phổ biến" ngoài trang chủ.'
            : 'Chưa chọn — trang chủ sẽ tự lấy ảnh của sản phẩm đầu tiên trong bộ sưu tập này. Chọn ảnh nếu muốn quyết định rõ.'
        }
      >
        <MediaPicker
          value={values.coverMediaId ? [values.coverMediaId] : []}
          onChange={(ids) => set('coverMediaId', ids[0] ?? null)}
          multiple={false}
          kind="image"
        />
      </Fieldset>
    </div>
  );
}
