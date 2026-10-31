import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { IS_DEMO } from './demo/mockApi';
import { PublishProvider } from './publish/PublishProvider';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductListPage } from './pages/products/ProductListPage';
import { CategoryListPage } from './pages/categories/CategoryListPage';
import { CategoryDetailPage } from './pages/categories/CategoryDetailPage';
import { CollectionListPage } from './pages/collections/CollectionListPage';
import { CollectionDetailPage } from './pages/collections/CollectionDetailPage';
import { BannerPage } from './pages/BannerPage';
import { ContactChannelPage } from './pages/ContactChannelPage';
import { SiteSettingsPage } from './pages/SiteSettingsPage';
import { MediaLibraryPage } from './pages/MediaLibraryPage';
import { AccountPage } from './pages/AccountPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading label="Đang kiểm tra đăng nhập…" />;
  if (!user) return <Navigate to="/dang-nhap" replace />;
  return <>{children}</>;
}

// The demo build is hosted on plain static hosting with no rewrite rules, so
// deep links like /admin/san-pham would 404 before React ever loads. Hash
// routing keeps every route reachable without server config. Normal builds sit
// behind Nginx, which has the SPA fallback, and keep clean URLs.
const Router = IS_DEMO ? HashRouter : BrowserRouter;

export function App() {
  return (
    <Router basename={IS_DEMO ? undefined : '/admin'}>
      <AuthProvider>
        <PublishProvider>
          <Routes>
            <Route path="/dang-nhap" element={<LoginPage />} />

            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<DashboardPage />} />

              {/* Products and categories are created and edited in a panel on
                  their list page, so they need no routes of their own. */}
              <Route path="san-pham" element={<ProductListPage />} />
              <Route path="danh-muc" element={<CategoryListPage />} />
              <Route path="danh-muc/:id" element={<CategoryDetailPage />} />

              <Route path="bo-suu-tap" element={<CollectionListPage />} />
              {/* Still a page: choosing a collection's products needs the room. */}
              <Route path="bo-suu-tap/:id" element={<CollectionDetailPage />} />

              <Route path="banner" element={<BannerPage />} />
              <Route path="lien-he" element={<ContactChannelPage />} />
              <Route path="thong-tin-cua-hang" element={<SiteSettingsPage />} />
              <Route path="thu-vien-anh" element={<MediaLibraryPage />} />
              <Route path="tai-khoan" element={<AccountPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PublishProvider>
      </AuthProvider>
    </Router>
  );
}
