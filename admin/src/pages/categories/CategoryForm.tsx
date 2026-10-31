import { useState } from 'react';
import { Field, Fieldset, slugify } from '../../components/ui';
import { MediaPicker } from '../../media/MediaPicker';
import type { Category } from '../../lib/types';

export interface CategoryFormValues {
  name: string;
  slug: string;
  isActive: boolean;
  coverMediaId: string | null;
}

export function emptyCategory(): CategoryFormValues {
  return { name: '', slug: '', isActive: true, coverMediaId: null };
}

export function categoryToValues(category: Category): CategoryFormValues {
  return {
    name: category.name,
    slug: category.slug,
    isActive: category.isActive,
    coverMediaId: category.coverMediaId,
  };
}

// No sortOrder: position is set with the arrows on the list, never typed here.
export function categoryPayload(values: CategoryFormValues) {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    isActive: values.isActive,
    coverMediaId: values.coverMediaId,
  };
}

export function CategoryForm({
  values,
  onChange,
  lockSlug = false,
}: {
  values: CategoryFormValues;
  onChange: (values: CategoryFormValues) => void;
  lockSlug?: boolean;
}) {
  const [slugTouched, setSlugTouched] = useState(lockSlug);

  function set<K extends keyof CategoryFormValues>(key: K, value: CategoryFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <div className="card">
      <Fieldset title="Thông tin danh mục">
        <Field label="Tên danh mục">
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
          hint={
            lockSlug
              ? 'Đổi đường dẫn sẽ làm hỏng các liên kết cũ đã chia sẻ cho khách.'
              : 'Tự điền theo tên danh mục.'
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
      </Fieldset>

      <Fieldset title="Hiển thị">
        <label className="checkline">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
          />
          Hiện danh mục này trên website
        </label>
      </Fieldset>

      {/* Optional by design. Left empty, the site shows the first photo of the
          first product inside, so the homepage never has a gap waiting for
          someone to remember this field. */}
      <Fieldset
        title="Ảnh đại diện"
        hint="Hiện chưa dùng ở đâu trên website — trang chủ đang hiển thị bộ sưu tập thay cho danh mục. Giữ lại phòng khi bạn muốn bật lại mục danh mục sau này."
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
