"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { scannerSession } from "./scanner-session";

export function QrScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const teardown = useRef<Promise<void>>(Promise.resolve());
  const [camera, setCamera] = useState("");
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [state, setState] = useState("Meminta izin kamera...");
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let decoding: Promise<void> = Promise.resolve();
    let session: ReturnType<typeof scannerSession> | undefined;
    const video = videoRef.current!;
    const stopTracks = () => {
      stream?.getTracks().forEach((track) => track.stop());
      if (video.srcObject === stream) video.srcObject = null;
    };
    async function open() {
      await teardown.current;
      if (cancelled) return;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
      // jsQR decodes pixels directly: no frame uploads, File objects or blob URLs.
      // html5-qrcode 2.3.8's scanFile creates an unreclaimed URL on each frame.
      const { default: decodeQr } = await import("jsqr");
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      async function scanFrame() {
        if (cancelled) return;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) {
          const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = decodeQr(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
          if (!cancelled && code) session?.decode(code.data);
        }
        if (!cancelled) timer = setTimeout(() => { decoding = scanFrame(); }, 250);
      }
      session = scannerSession({
        start: async () => {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: camera ? { deviceId: { exact: camera } } : { facingMode: { ideal: "environment" } } });
          if (cancelled) { stopTracks(); return; }
          video.srcObject = stream;
          await video.play();
          if (cancelled) { stopTracks(); return; }
          setState("Arahkan QR ke dalam area pemindaian.");
          // Enumeration failure must not discard an otherwise working camera.
          void navigator.mediaDevices.enumerateDevices().then((devices) => {
            if (!cancelled) setCameras(devices.filter((device) => device.kind === "videoinput"));
          }).catch(() => undefined);
          decoding = scanFrame();
        },
        stop: async () => { stopTracks(); clearTimeout(timer); await decoding; },
        clear: () => { canvas.width = 0; canvas.height = 0; },
      }, onScan);
      await session.ready;
    }
    void open().catch(() => {
      stopTracks();
      if (!cancelled) setState("Kamera tidak dapat dibuka. Izinkan akses kamera, pastikan HTTPS, atau gunakan kode manual di bawah.");
    });
    const release = () => {
      cancelled = true;
      clearTimeout(timer);
      stopTracks();
      if (session) teardown.current = session.dispose().catch(() => undefined);
    };
    const close = () => { release(); onClose(); };
    const closeWhenHidden = () => { if (document.hidden) close(); };
    window.addEventListener("pagehide", close);
    document.addEventListener("visibilitychange", closeWhenHidden);
    return () => {
      window.removeEventListener("pagehide", close);
      document.removeEventListener("visibilitychange", closeWhenHidden);
      release();
    };
  }, [camera, onScan, onClose]);

  return <section className="space-y-3 rounded-xl border border-success/20 p-3" aria-label="Pemindai QR">
    <div className="relative mx-auto aspect-square w-full max-w-96 overflow-hidden rounded-lg bg-muted"><video ref={videoRef} muted playsInline className="h-full w-full object-contain" aria-label="Pratinjau kamera" /><div className="pointer-events-none absolute inset-[15%] rounded-xl border-2 border-champagne" /></div>
    <p role="status" className="text-sm">{state}</p>
    {cameras.length > 1 && <div className="space-y-2"><Label htmlFor="camera">Pilih kamera</Label><select id="camera" className="min-h-12 w-full rounded-lg border bg-white px-3" value={camera} onChange={(event) => { setState("Membuka kamera..."); setCamera(event.target.value); }}><option value="">Kamera belakang otomatis</option>{cameras.map((item, index) => <option key={item.deviceId} value={item.deviceId}>{item.label || `Kamera ${index + 1}`}</option>)}</select></div>}
    <Button type="button" variant="outline" className="min-h-12 w-full" onClick={onClose}>Tutup kamera</Button>
  </section>;
}
