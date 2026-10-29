export interface CameraScanner {
  start(): Promise<void>;
  stop(): Promise<void>;
  clear(): void;
}

// Disposal also waits for a pending browser permission prompt/start to settle.
export function scannerSession(scanner: CameraScanner, onScan: (code: string) => void) {
  let closed = false, decoded = false;
  const ready = Promise.resolve().then(() => { if (!closed) return scanner.start(); });
  let disposal: Promise<void> | undefined;
  return {
    ready,
    decode(code: string) {
      if (!closed && !decoded) { decoded = true; onScan(code); }
    },
    dispose() {
      closed = true;
      disposal ??= ready.catch(() => undefined).then(async () => {
        try { await scanner.stop(); } finally { scanner.clear(); }
      });
      return disposal;
    },
  };
}
