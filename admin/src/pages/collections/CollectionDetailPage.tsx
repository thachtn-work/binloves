import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import type { Collection, Product } from '../../lib/types';
import { ErrorAlert, Loading, PageHead, formatPrice } from '../../components/ui';
import { OrderButtons, moveItem } from '../../components/OrderButtons';
import { usePublish } from '../../publish/PublishProvider';

/**
 * Only the membership job lives here. The collection's name and description
 * are edited in the panel on the list screen, so this page has one purpose
 * rather than two tabs competing for attention.
 */
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['collections'] });
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

      <div className="card">
        <div className="fieldset">
          <h2 className="fieldset__title">Sản phẩm đã chọn</h2>
          <p className="fieldset__hint">Thứ tự ở đây là thứ tự khách nhìn thấy trên trang chủ.</p>

          {chosen.length === 0 ? (
            <p className="field__hint">Chưa chọn sản phẩm nào.</p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <tbody>
                  {chosen.map((product, index) => (
                    <tr key={product.id}>
                      <td style={{ width: 78 }}>
                        <OrderButtons
                          index={index}
                          total={chosen.length}
                          onMove={(from, to) => setSelected(moveItem(selected, from, to))}
                        />
                      </td>
                      <td>
                        <div className="cellmain">{product.name}</div>
                        <div className="cellsub">
                          {formatPrice(product.salePrice ?? product.price)}
                          {!product.isActive && ' · đang ẩn'}
                        </div>
                      </td>
                      <td style={{ width: 90 }}>
                        <div className="table__actions">
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            onClick={() => setSelected(selected.filter((s) => s !== product.id))}
                          >
                            Bỏ
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="fieldset">
          <h2 className="fieldset__title">Thêm sản phẩm</h2>
          <p className="fieldset__hint">Chọn từ danh sách sản phẩm của cửa hàng.</p>

          <input
            className="input"
            placeholder="Tìm theo tên sản phẩm…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ marginBottom: 12 }}
          />

          {available.length === 0 ? (
            <p className="field__hint">
              {filter ? 'Không có sản phẩm nào khớp từ khoá.' : 'Đã thêm tất cả sản phẩm.'}
            </p>
          ) : (
            <div className="table-scroll" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table className="table">
                <tbody>
                  {available.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="cellmain">{product.name}</div>
                        <div className="cellsub">
                          {formatPrice(product.salePrice ?? product.price)}
                          {!product.isActive && ' · đang ẩn'}
                        </div>
                      </td>
                      <td style={{ width: 110 }}>
                        <div className="table__actions">
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => setSelected([...selected, product.id])}
                          >
                            Thêm
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
