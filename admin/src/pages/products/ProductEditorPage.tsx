import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { upsertRow } from '../../lib/cache';
import type { Product } from '../../lib/types';
import { ErrorAlert, Loading, PageHead } from '../../components/ui';
import { usePublish } from '../../publish/PublishProvider';
import { ProductForm, emptyProduct, productToValues, valuesToPayload } from './ProductForm';
import type { ProductFormValues } from './ProductForm';

/*
  Adding and editing a product on its own page, at its own address.

  It was a slide-over panel, and the panel is the better answer for a short
  form — the list stays in view behind it. This one is not short: four
  sections, an image picker and a variant grid, which fills the panel and
  leaves the list it was meant to keep visible as a sliver down one side.
  Worse for the owner of this shop, it is not what they have: they spent a
  year on an admin where /products/:id was a page, and reached for Back when
  they were done.

  A page gives that back, and gives two things the panel could not: an address
  for the product being edited, which can be bookmarked or sent to someone,
  and a browser history entry that behaves the way every other page does.
*/
export function ProductEditorPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();

  const [error, setError] = useState<string | null>(null);

  /*
    Seeded from the cache on the very first render, not filled in afterwards.

    An effect would have been the obvious way to do this, and it was: the page
    painted an empty form, then a moment later the product arrived and the
    fields filled themselves. Measured here, that moment was over a second —
    long enough for the owner to click Sửa, start typing the new price, and
    have it wiped out from under them when the real values landed. The form
    also refused to submit while it lasted, because the slug field was empty
    and required, so the first click on Lưu did nothing at all and said
    nothing about why.
  */
  const [values, setValues] = useState<ProductFormValues>(() => {
    if (mode === 'create') return emptyProduct();
    const cached = queryClient
      .getQueryData<Product[]>(['products'])
      ?.find((p) => p.id === id);
    return cached ? productToValues(cached) : emptyProduct();
  });

  /*
    Read through the list the admin already holds rather than asking for one
    product on its own. Arriving here from the table means the answer is in
    the cache and the form is filled before the page paints; arriving by a
    pasted link costs the one request the list would have cost anyway.
  */
  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
    enabled: mode === 'edit',
  });

  const product = mode === 'edit' ? products?.find((p) => p.id === id) : undefined;

  /*
    The cold case: the address was pasted or reloaded, so there was no cache to
    seed from and the product has only just arrived. Adjusting state here
    rather than in an effect is React's own answer for state derived from
    props — it re-renders before the browser paints, so there is no empty
    frame to type into. The ref makes it happen once per product, and again if
    the id in the address changes underneath.
  */
  const filledFor = useRef<string | null>(mode === 'create' ? 'create' : null);
  if (product && filledFor.current !== product.id) {
    filledFor.current = product.id;
    setValues(productToValues(product));
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = valuesToPayload(values);
      if (mode === 'edit' && id) {
        return (await api.patch<Product>(`/products/${id}`, payload)).data;
      }
      return (await api.post<Product>('/products', payload)).data;
    },
    onSuccess: (saved) => {
      // The API answered with the whole product, so the list it belongs to is
      // already here. 'head' is where the API puts it: products are ordered by
      // sortOrder ascending then createdAt descending, and a new one keeps
      // sortOrder 0.
      upsertRow(queryClient, ['products'], saved, 'head');
      notifyChange(mode === 'create' ? 'Thêm sản phẩm thành công' : 'Cập nhật sản phẩm thành công');
      // `replace`, so Back from the list does not walk into the form that was
      // just submitted and offer to submit it again.
      navigate('/san-pham', {
        replace: true,
        state: mode === 'create' ? { newId: saved.id } : undefined,
      });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (mode === 'edit' && isLoading) return <Loading />;

  if (mode === 'edit' && !product) {
    return (
      <>
        <PageHead title="Không tìm thấy sản phẩm" />
        <div className="card">
          <div className="fieldset">
            <p className="field__hint">
              Sản phẩm này có thể đã bị xoá. Quay lại danh sách để xem những sản phẩm đang có.
            </p>
            <div className="formbar">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => navigate('/san-pham')}
              >
                Về danh sách sản phẩm
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        title={mode === 'edit' ? 'Chỉnh sửa Sản phẩm' : 'Thêm Sản phẩm Mới'}
        hint={mode === 'edit' ? product?.name : 'Điền thông tin rồi lưu để đăng lên website.'}
      />

      <ErrorAlert message={error} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          save.mutate();
        }}
      >
        <div className="card">
          <ProductForm values={values} onChange={setValues} lockSlug={mode === 'edit'} />
        </div>

        {/* Below the form rather than pinned to the window: on a page the
            buttons belong at the end of what they act on, which is where the
            eye arrives after the last field. */}
        <div className="formbar">
          <button type="submit" className="btn btn--primary" disabled={save.isPending}>
            {save.isPending ? 'Đang lưu…' : mode === 'edit' ? 'Lưu thay đổi' : 'Thêm sản phẩm'}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => navigate('/san-pham')}
          >
            Huỷ
          </button>
        </div>
      </form>
    </>
  );
}
