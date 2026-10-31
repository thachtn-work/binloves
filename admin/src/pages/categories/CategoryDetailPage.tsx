import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import type { Category, Product } from '../../lib/types';
import { Empty, ErrorAlert, Loading, PageHead, StatusTag, formatPrice } from '../../components/ui';
import { OrderButtons } from '../../components/OrderButtons';
import { useRowDrag } from '../../components/useRowDrag';
import { MediaThumb } from '../../media/MediaThumb';
import { usePublish } from '../../publish/PublishProvider';

/**
 * Ordering only. Which products are in a category is decided on the product
 * itself — a product has one category, so there is no membership to manage
 * here the way a collection has.
 *
 * Each arrow saves immediately instead of collecting changes behind a button.
 * A move is one swap on the server, so there is no half-finished state worth
 * protecting, and a shop owner reordering twenty products should not have to
 * remember to save at the end.
 */
export function CategoryDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { notifyChange } = usePublish();
  const [error, setError] = useState<string | null>(null);

  const { data: category, isLoading } = useQuery({
    queryKey: ['categories', id],
    queryFn: async () => (await api.get<Category>(`/categories/${id}`)).data,
  });

  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ['products', { categoryId: id }],
    queryFn: async () => (await api.get<Product[]>(`/products?categoryId=${id}`)).data,
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => api.put('/products/reorder', { categoryId: id, ids }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      notifyChange();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const move = useMutation({
    mutationFn: async ({ productId, direction }: { productId: string; direction: 'up' | 'down' }) =>
      api.put(`/products/${productId}/move`, { direction }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      notifyChange();
    },
    onError: (err) => setError(errorMessage(err)),
  });

  // Both of these are hooks, so they run before the early return below: React
  // requires the same hooks in the same order on every render, and putting
  // useRowDrag after the loading branch made the component throw the moment
  // the page was opened by URL instead of clicked into from the list.
  const items = products ?? [];
  const drag = useRowDrag(
    items,
    (p) => p.id,
    (ids) => reorder.mutate(ids),
    reorder.isPending || move.isPending,
  );

  if (isLoading || loadingProducts) return <Loading />;

  return (
    <>
      <Link className="backlink" to="/danh-muc">
        ← Danh mục
      </Link>

      <PageHead
        title={`Thứ tự sản phẩm — ${category?.name ?? ''}`}
        hint="Kéo một dòng để đổi chỗ, hoặc dùng mũi tên. Thứ tự ở đây chính là thứ tự khách nhìn thấy trên trang danh mục ngoài website."
      />

      <ErrorAlert message={error} />

      <div className="card">
        <div className="fieldset">
          {items.length === 0 ? (
            <Empty title="Danh mục này chưa có sản phẩm nào">
              <p>
                Thêm sản phẩm ở màn <Link to="/san-pham">Sản phẩm</Link> và chọn danh mục này cho
                nó.
              </p>
            </Empty>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 62 }}>Xem trước</th>
                    <th>Sản phẩm</th>
                    <th style={{ width: 140 }}>Giá</th>
                    <th style={{ width: 120 }}>Hiển thị</th>
                    <th style={{ width: 92 }}>Thứ tự</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((product, index) => {
                    const cover = [...product.media].sort((a, b) => a.sortOrder - b.sortOrder)[0];
                    return (
                      <tr key={product.id} {...drag.rowProps(product)}>
                        <td>
                          {cover ? (
                            <MediaThumb className="thumb" media={cover.media} />
                          ) : (
                            <div className="thumb" />
                          )}
                        </td>
                        <td>
                          <div className="cellmain">
                            <span
                              className="draghandle"
                              role="button"
                              tabIndex={-1}
                              aria-label="Kéo để đổi thứ tự"
                              {...drag.gripProps(product)}
                            >
                              ⠿
                            </span>
                            {product.name}
                          </div>
                          <div className="cellsub">/{product.slug}</div>
                        </td>
                        <td className="cellsub">{formatPrice(product.salePrice ?? product.price)}</td>
                        <td>
                          <StatusTag active={product.isActive} />
                        </td>
                        <td>
                          <OrderButtons
                            index={index}
                            total={items.length}
                            disabled={move.isPending || reorder.isPending}
                            onMove={(from, to) =>
                              move.mutate({
                                productId: product.id,
                                direction: to < from ? 'up' : 'down',
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
