import { useCallback, useRef } from "react";

interface PollOptions {
  interval: number;
  maxAttempts?: number;
}

export function usePolling() {
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const startPolling = useCallback(
    (
      id: string,
      pollFn: () => Promise<{ done: boolean; data?: unknown }>,
      opts: PollOptions
    ): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = opts.maxAttempts || 120;

        const tick = async () => {
          attempts++;
          try {
            const result = await pollFn();
            if (result.done) {
              timersRef.current.delete(id);
              resolve(result.data);
              return;
            }
            if (attempts >= maxAttempts) {
              timersRef.current.delete(id);
              reject(new Error(`Polling timeout for ${id}`));
              return;
            }
            const timer = setTimeout(tick, opts.interval);
            timersRef.current.set(id, timer);
          } catch (err) {
            timersRef.current.delete(id);
            reject(err);
          }
        };

        tick();
      });
    },
    []
  );

  const stopPolling = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const stopAll = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      clearTimeout(timer);
    }
    timersRef.current.clear();
  }, []);

  return { startPolling, stopPolling, stopAll };
}
