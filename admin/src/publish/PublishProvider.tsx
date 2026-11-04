import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Only the two actions, deliberately — the phase is not on here.
 *
 * A context value that changes re-renders every consumer, and `usePublish()`
 * is called from nine pages. Holding the toast's state in here meant each
 * change to it redrew the product table sitting behind the toast. No page
 * ever read it; they all want `notifyChange` and nothing else, and the toast
 * lives inside the provider where the state already is.
 *
 * Memoised so the value is the same object for the life of the app.
 */
interface PublishContextValue {
  /**
   * Call after a successful save, with what was saved — "Cập nhật sản phẩm
   * thành công", "Đã xoá danh mục". The caller names it because only the
   * caller knows; a toast written here could say nothing more specific than
   * "đã lưu", which is the part the owner could already see.
   */
  notifyChange: (message: string) => void;
  dismiss: () => void;
}

const PublishContext = createContext<PublishContextValue | null>(null);

/*
  Saving is the whole of publishing now, so this says so and gets out of the way.

  It used to poll /publish/status every two seconds for up to three minutes,
  narrating a build: "Website sẽ hiển thị sau khoảng 10-30 giây", then "Đang
  dựng lại trang". That was true of the version this shop ran before, where a
  save kicked off a static rebuild. It is not true now — the site renders per
  request, and a save only drops a cached snapshot, which is done before the
  response reaches the browser.

  The narration had also stopped working, in a way nobody would report as a
  bug because it looked like slowness. The admin recorded the save time when
  the response arrived; the server recorded the clear while still handling the
  request, a millisecond earlier. The panel waited for a build that finished
  *after* the save, so the comparison could never come true. Measured against
  the real backend: 91 polls, 181 seconds, ending on "Chưa rõ trạng thái
  website — không kết nối được tới dịch vụ cập nhật website." Every save. For
  an owner who had just corrected a price, the admin spent three minutes
  implying it had not gone through, and then said something that reads like a
  failure.

  What is left says what the owner just did, on the screen they did it on.
  Nothing about the website: this admin writes to a database that the site
  reads per request, so there is no second place for a change to travel to and
  no delay worth mentioning. Telling someone their edit "has reached the
  website" invites them to go and check, which is work the old architecture
  created and this one does not.
*/
export function PublishProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  const notifyChange = useCallback((text: string) => setMessage(text), []);
  const dismiss = useCallback(() => setMessage(null), []);

  useEffect(() => {
    if (message === null) return;
    const t = window.setTimeout(() => setMessage(null), 3000);
    return () => window.clearTimeout(t);
  }, [message]);

  const actions = useMemo(() => ({ notifyChange, dismiss }), [notifyChange, dismiss]);

  return (
    <PublishContext.Provider value={actions}>
      {children}
      {message !== null && <SavedToast message={message} onDismiss={dismiss} />}
    </PublishContext.Provider>
  );
}

export function usePublish() {
  const ctx = useContext(PublishContext);
  if (!ctx) throw new Error('usePublish must be used inside PublishProvider');
  return ctx;
}

function SavedToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="publish-toast publish-toast--ok" role="status" aria-live="polite">
      <div className="publish-toast__body">
        {/* One line. A second line here would be the place a sentence about
            the website crept back in. */}
        <p className="publish-toast__title">{message}</p>
      </div>
      <button type="button" className="publish-toast__close" onClick={onDismiss} aria-label="Đóng">
        ×
      </button>
    </div>
  );
}
