import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { errorMessage } from '../lib/api';
import { ErrorAlert, Field } from '../components/ui';

// Set at build time (VITE_SHOP_NAME). The login screen runs before anyone is
// authenticated, so it cannot read the shop name from the database the way
// every other screen does — and hardcoding it here would make this file
// client-specific.
const SHOP_NAME = import.meta.env.VITE_SHOP_NAME ?? 'Cửa hàng';

export function LoginPage() {
  const { user, ready, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (ready && user) return <Navigate to="/" replace />;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err, 'Email hoặc mật khẩu không đúng.'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login">
      <div>
        {/* Sits above the card rather than inside it, so the card stays a
            plain form and the branding belongs to the page. */}
        <div className="login__brand">
          <p className="login__brand-name">{SHOP_NAME}</p>
          <p className="login__brand-sub">Trang quản trị cửa hàng</p>
        </div>

        <form className="login__card" onSubmit={onSubmit}>
          <h1 className="login__title">Đăng nhập</h1>
          <p className="login__hint">Dùng tài khoản quản trị của cửa hàng.</p>

        <ErrorAlert message={error} />

        <Field label="Email">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
        </Field>

        <Field label="Mật khẩu">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

          <button
            type="submit"
            className="btn btn--primary"
            style={{ width: '100%', marginTop: 18 }}
            disabled={pending}
          >
            {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
