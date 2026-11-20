import { useCallback, useEffect, useRef, useState } from 'react';

// Grabación de voz con el micrófono, con tope de duración según el plan.
export function useRecorder(maxSeconds: number, onDone: (blob: Blob) => void, onError: (msg: string) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const cancelled = useRef(false);
  const cb = useRef({ onDone, onError });
  cb.current = { onDone, onError };

  const cleanup = useCallback(() => {
    window.clearInterval(timer.current);
    mr.current?.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
    setSeconds(0);
  }, []);

  const stop = useCallback(() => { if (mr.current && mr.current.state !== 'inactive') mr.current.stop(); }, []);
  const cancel = useCallback(() => { cancelled.current = true; stop(); }, [stop]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      cb.current.onError('Tu navegador no permite grabar audio. Puedes subir un archivo de audio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = []; cancelled.current = false;
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        cleanup();
        if (!cancelled.current && blob.size > 0) cb.current.onDone(blob);
      };
      mr.current = rec;
      rec.start();
      setRecording(true);
      let s = 0;
      timer.current = window.setInterval(() => { s += 1; setSeconds(s); if (s >= maxSeconds) stop(); }, 1000);
    } catch {
      cb.current.onError('No tengo permiso para usar el micrófono. Actívalo en los ajustes del navegador o del móvil.');
    }
  }, [cleanup, maxSeconds, stop]);

  useEffect(() => () => { cancelled.current = true; stop(); }, [stop]);
  return { recording, seconds, start, stop, cancel };
}
