import type { CSSProperties } from 'react';

/**
 * One preview tile for a library item, whichever kind it is.
 *
 * A clip has no still of its own, so `#t=0.1` asks the browser to seek to the
 * first frame and paint that. Without it `preload="metadata"` fetches the
 * duration and shows an empty black box — which, in a grid, looks exactly like
 * an upload that failed.
 *
 * Nothing here ever plays: these are pickers and list rows, and sound or motion
 * in a table is noise. The shop owner watches the clip on the website.
 */
export function MediaThumb({
  media,
  className,
  style,
}: {
  media: { url: string; mediaType?: 'image' | 'video'; filename?: string };
  className?: string;
  style?: CSSProperties;
}) {
  const isVideo = media.mediaType === 'video';

  return (
    <span className={['mediathumb', className].filter(Boolean).join(' ')} style={style}>
      {isVideo ? (
        <video src={`${media.url}#t=0.1`} muted playsInline preload="metadata" />
      ) : (
        <img src={media.url} alt={media.filename ?? ''} loading="lazy" />
      )}
      {isVideo && <span className="mediathumb__badge" aria-label="Video" />}
    </span>
  );
}
