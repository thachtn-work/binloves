import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { ErrorAlert, Field, Fieldset, PageHead } from '../components/ui';

export function AccountPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const mismatch = confirmPassword !== '' && newPassword !== confirmPassword;

  const change = useMutation({
    mutationFn: async () => api.patch('/auth/password', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 4000);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        change.mutate();
      }}
    >
      <PageHead title="Tài khoản" hint="Thông tin đăng nhập trang quản trị." />

      <ErrorAlert message={error} />

      <div className="card">
        <Fieldset title="Đăng nhập">
          <Field label="Email">
            <input className="input" value={user?.email ?? ''} readOnly disabled />
          </Field>
        </Fieldset>

        <Fieldset title="Đổi mật khẩu" hint="Mật khẩu mới cần ít nhất 8 ký tự.">
          <Field label="Mật khẩu hiện tại">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </Field>

          <Field label="Mật khẩu mới">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </Field>

          <Field
            label="Nhập lại mật khẩu mới"
            error={mismatch ? 'Hai mật khẩu chưa khớp nhau.' : undefined}
          >
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={mismatch}
              required
            />
          </Field>
        </Fieldset>
      </div>

      <div className="formbar">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={change.isPending || mismatch || newPassword === ''}
        >
          {change.isPending ? 'Đang đổi…' : 'Đổi mật khẩu'}
        </button>
        {saved && <span className="field__hint">Đã đổi mật khẩu.</span>}
      </div>
    </form>
  );
}
