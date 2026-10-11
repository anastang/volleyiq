import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const h = () => setMatch(mq.matches);
    h();
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [query]);
  return match;
}

/** Phone-sized screen (portrait phones and small landscape phones). */
export const usePhone = () => useMediaQuery('(max-width: 640px)');
