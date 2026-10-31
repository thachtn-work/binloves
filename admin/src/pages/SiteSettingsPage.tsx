import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import type { SiteSettings } from '../lib/types';
import { ErrorAlert, Field, Fieldset, Loading, PageHead } from '../components/ui';
import { usePublish } from '../publish/PublishProvider';

export function SiteSettingsPage() {
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();
  const [form, setForm] = useState<SiteSettings>({
    shopName: '',
    tagline: '',
    intro: '',
    seoDescription: '',
    address: '',
    businessHours: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['site-settings'],
    queryFn: async () => (await api.get<SiteSettings>('/site-settings')).data,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      shopName: data.shopName ?? '',
      tagline: data.tagline ?? '',
      intro: data.intro ?? '',
      seoDescription: data.seoDescription ?? '',
      address: data.address ?? '',
      businessHours: data.businessHours ?? '',
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () =>
      // `null`, not `undefined`: JSON drops an undefined key, so the request
      // simply omitted the field and the server read that as "leave alone" —
      // which meant emptying any box here never cleared anything. Every one of
      // these is optional and says so, so emptying one has to mean emptying it.
      api.put('/site-settings', {
        shopName: form.shopName?.trim() || null,
        tagline: form.tagline?.trim() || null,
        intro: form.intro?.trim() || null,
        seoDescription: form.seoDescription?.trim() || null,
        address: form.address?.trim() || null,
        businessHours: form.businessHours?.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['site-settings'] });
      notifyChange();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function set<K extends keyof SiteSettings>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  if (isLoading) return <Loading />;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        save.mutate();
      }}
    >
      <PageHead title="Thông tin cửa hàng" hint="Tên, giới thiệu và địa chỉ hiển thị trên website." />

      <ErrorAlert message={error} />

      <div className="card">
        <Fieldset title="Nhận diện" hint="Tên cửa hàng hiển thị ở đầu trang và trên thẻ trình duyệt.">
          <Field label="Tên cửa hàng">
            <input
              className="input"
              value={form.shopName ?? ''}
              onChange={(e) => set('shopName', e.target.value)}
            />
          </Field>

          <Field label="Câu giới thiệu" hint="Dòng lớn ở đầu trang chủ.">
            <input
              className="input"
              value={form.tagline ?? ''}
              onChange={(e) => set('tagline', e.target.value)}
            />
          </Field>

          <Field
            label="Giới thiệu ngắn"
            hint="Vài câu về cửa hàng, hiện ở góc dưới bên phải của ảnh đầu trang chủ. Để trống thì góc đó bỏ trống."
          >
            <textarea
              className="textarea"
              style={{ minHeight: 110 }}
              maxLength={600}
              value={form.intro ?? ''}
              onChange={(e) => set('intro', e.target.value)}
            />
          </Field>
        </Fieldset>

        <Fieldset
          title="Mô tả tìm kiếm"
          hint="Đoạn mô tả Google hiển thị bên dưới tên website trong kết quả tìm kiếm."
        >
          <Field label="Mô tả">
            <textarea
              className="textarea"
              style={{ minHeight: 86 }}
              maxLength={300}
              value={form.seoDescription ?? ''}
              onChange={(e) => set('seoDescription', e.target.value)}
            />
          </Field>
        </Fieldset>

        <Fieldset title="Địa chỉ & giờ làm việc" hint="Hiển thị ở chân trang website.">
          <Field label="Địa chỉ">
            <input
              className="input"
              value={form.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
            />
          </Field>

          <Field label="Giờ làm việc" hint="Ví dụ: 9:00 - 21:00, T2 - CN">
            <input
              className="input"
              value={form.businessHours ?? ''}
              onChange={(e) => set('businessHours', e.target.value)}
            />
          </Field>
        </Fieldset>
      </div>

      <div className="formbar">
        <button type="submit" className="btn btn--primary" disabled={save.isPending}>
          {save.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
        {saved && <span className="field__hint">Đã lưu.</span>}
      </div>
    </form>
  );
}
