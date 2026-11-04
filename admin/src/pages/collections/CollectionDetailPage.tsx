import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import type { Collection, Product } from '../../lib/types';
import { ErrorAlert, Loading, PageHead, formatPrice } from '../../components/ui';
import { OrderButtons, moveItem } from '../../components/OrderButtons';
import { MediaThumb } from '../../media/MediaThumb';
import { usePublish } from '../../publish/PublishProvider';

/**
 * Only the membership job lives here. The collection's name and description
 * are edited in the panel on the list screen, so this page has one purpose
 * rather than two tabs competing for attention.
 */
/* One product as it appears on either side of the picker: the picture first,
   because that is what the owner recognises, then the name, then the price. */
function ProductBit({ product }: { product: Product }) {
  const cover = [...product.media].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return (
    <>
      {cover ? (
        <MediaThumb className="thumb thumb--sm" media={cover.media} />
      ) : (
        <span className="thumb thumb--sm" />
      )}
      <span className="picker__text">
        <span className="picker__name">{product.name}</span>
        <span className="picker__meta">
          {formatPrice(product.salePrice ?? product.price)}
          {!product.isActive && ' · đang ẩn'}
        </span>
      </span>
    </>
  );
}

export function CollectionDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: collection, isLoading } = useQuery({
    queryKey: ['collections', id],
    queryFn: async () => (await api.get<Collection>(`/collections/${id}`)).data,
  });

  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });

  useEffect(() => {
    if (!collection?.products) return;
    setSelected(
      [...collection.products].sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.productId),
    );
  }, [collection]);

  const save = useMutation({
    mutationFn: async () => api.put(`/collections/${id}/products`, { productIds: selected }),
    // The API answers with nothing, so this page does have to ask again for
    // the collection it is showing. The list of collections is a different
    // matter: only its product counts moved, and it is not on screen — mark it
    // stale and let the next visit pay for it.
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['collections'], exact: true, refetchType: 'none' });
      await queryClient.invalidateQueries({ queryKey: ['collections', id] });
      notifyChange();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  if (isLoading || loadingProducts) return <Loading />;

  const byId = new Map((products ?? []).map((p) => [p.id, p]));
  const chosen = selected.map((pid) => byId.get(pid)).filter((p): p is Product => Boolean(p));
  const available = (products ?? []).filter(
    (p) => !selected.includes(p.id) && p.name.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <>
      <Link className="backlink" to="/bo-suu-tap">
        ← Quay lại danh sách bộ sưu tập
      </Link>

      <PageHead
        title={collection?.name ?? 'Bộ sưu tập'}
        hint="Chọn sản phẩm và sắp xếp thứ tự hiển thị trong khu vực này."
      />

      <ErrorAlert message={error} />

      {/*
        Two columns side by side, the shape this shop picked products in
        before: everything available on the left, everything chosen on the
        right, and one click moves a row across. It reads as a single
        statement — these are in, those are out — where stacking the two
        lists meant scrolling between them to see both halves of one decision.

        What the old version did not have, and keeps here: the thumbnail and
        the price. With 264 products a name alone is not enough to tell two
        similar items apart, and the price is how the owner recognises them.
      */}
      <div className="picker">
        <div className="picker__col">
          <h2 className="picker__title">Sản phẩm đang có</h2>
          <input
            className="input"
            placeholder="Tìm theo tên sản phẩm…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="picker__list">
            {available.length === 0 ? (
              <p className="picker__empty">
                {filter ? 'Không có sản phẩm nào khớp từ khoá.' : 'Đã thêm tất cả sản phẩm.'}
              </p>
            ) : (
              available.map((product) => (
                <button
                  type="button"
                  key={product.id}
                  className="picker__row"
                  onClick={() => setSelected([...selected, product.id])}
                  title={`Thêm "${product.name}"`}
                >
                  <ProductBit product={product} />
                  <ArrowRight className="picker__arrow" size={16} aria-hidden="true" />
                </button>
              ))
            )}
          </div>
        </div>

        <div className="picker__col">
          <h2 className="picker__title">Sản phẩm được chọn</h2>
          <p className="picker__note">Thứ tự ở đây là thứ tự khách nhìn thấy trên trang chủ.</p>
          <div className="picker__list">
            {chosen.length === 0 ? (
              <p className="picker__empty">Chưa chọn sản phẩm nào.</p>
            ) : (
              chosen.map((product, index) => (
                <div key={product.id} className="picker__row picker__row--chosen">
                  <ArrowLeft
                    className="picker__arrow"
                    size={16}
                    aria-hidden="true"
                    onClick={() => setSelected(selected.filter((x) => x !== product.id))}
                  />
                  <ProductBit product={product} />
                  {/* Order survives from the newer version, because it is the
                      thing this screen decides: which product the homepage
                      shows first. The old picker could not say. */}
                  <OrderButtons
                    index={index}
                    total={chosen.length}
                    onMove={(from, to) => setSelected(moveItem(selected, from, to))}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="formbar">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setError(null);
            save.mutate();
          }}
          disabled={save.isPending}
        >
          {save.isPending ? 'Đang lưu…' : 'Lưu danh sách sản phẩm'}
        </button>
        {saved && <span className="field__hint">Đã lưu.</span>}
      </div>
    </>
  );
}
