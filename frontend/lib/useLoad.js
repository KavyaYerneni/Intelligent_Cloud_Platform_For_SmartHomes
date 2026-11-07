import { useCallback, useEffect, useRef, useState } from 'react';

// Loads data and reloads when `deps` change (including the live version).
// A failed reload keeps the previous data and exposes the error, so a view can
// say "showing data from <time>" instead of silently looking current.
export function useLoad(loader, deps) {
  const [state, setState] = useState({ data: undefined, error: undefined, loading: true, at: undefined });
  const seq = useRef(0);
  const run = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const data = await loader();
      if (mine === seq.current) setState({ data, error: undefined, loading: false, at: new Date() });
    } catch (error) {
      if (mine === seq.current) setState(s => ({ ...s, error, loading: false }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}
