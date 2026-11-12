export function attendancePolling<T>(options: {
  load: (signal: AbortSignal) => Promise<T>;
  success: (data: T) => void;
  failure: (error: unknown) => void;
  busy: (busy: boolean) => void;
  visible: boolean;
  interval?: number;
}) {
  let visible = options.visible, disposed = false, running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  async function refresh() {
    if (disposed || running || !visible) return;
    clearTimeout(timer);
    running = true;
    controller = new AbortController();
    const active = controller;
    const timeout = setTimeout(() => active.abort(), 10_000);
    options.busy(true);
    try {
      const data = await options.load(active.signal);
      if (!disposed) options.success(data);
    } catch (error) { if (!disposed) options.failure(error); }
    finally {
      clearTimeout(timeout);
      running = false;
      if (!disposed) {
        options.busy(false);
        if (visible) timer = setTimeout(() => void refresh(), options.interval ?? 15_000);
      }
    }
  }
  return {
    refresh,
    visibility(value: boolean) {
      visible = value;
      clearTimeout(timer);
      if (visible) void refresh();
    },
    stop() { disposed = true; clearTimeout(timer); controller?.abort(); },
  };
}
