import { useEffect, useRef } from 'react';

/** Invisible sentinel that calls `onMore` when scrolled into view — the
 *  library's lists render incrementally instead of mounting hundreds of rows
 *  (or slicing results away silently). */
export function LoadMore({ onMore }: { onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onMore);
  cb.current = onMore;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) cb.current();
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <div ref={ref} className="h-px" aria-hidden />;
}
