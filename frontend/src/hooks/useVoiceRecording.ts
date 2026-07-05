import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_SECONDS = 30;
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/**
 * Hook تسجيل صوتي مشترك بين ميزتَي "التوثيق الصوتي" (EvidenceForm) و"تسجيل
 * صوتي سريع" (FAB). يدير صلاحية المايكروفون وMediaRecorder ويوقف التسجيل
 * تلقائياً بعد MAX_SECONDS ثانية، ثم يحوّل الناتج إلى base64 جاهز للإرسال
 * إلى Edge Function transcribe-voice.
 */
export function useVoiceRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('audio/webm');
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setAudioBase64(null);
    setSecondsElapsed(0);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('تم رفض إذن استخدام الميكروفون. يرجى السماح بالوصول إليه من إعدادات المتصفح ثم المحاولة مجدداً.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('لم يتم العثور على ميكروفون متصل بجهازك.');
      } else {
        setError('تعذّر بدء التسجيل الصوتي، يرجى المحاولة مجدداً.');
      }
      return;
    }
    streamRef.current = stream;

    const supportedType = MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported?.(t));
    const recorder = supportedType ? new MediaRecorder(stream, { mimeType: supportedType }) : new MediaRecorder(stream);
    const actualMimeType = recorder.mimeType || supportedType || 'audio/webm';
    setMimeType(actualMimeType);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = async () => {
      clearTimer();
      releaseStream();
      setIsRecording(false);
      const blob = new Blob(chunksRef.current, { type: actualMimeType });
      if (blob.size === 0) {
        setError('لم يتم تسجيل أي صوت، يرجى المحاولة مجدداً.');
        return;
      }
      try {
        setAudioBase64(await blobToBase64(blob));
      } catch {
        setError('تعذّر معالجة التسجيل الصوتي، يرجى المحاولة مجدداً.');
      }
    };

    recorder.start();
    setIsRecording(true);

    timerRef.current = setInterval(() => {
      setSecondsElapsed(prev => {
        const next = prev + 1;
        if (next >= MAX_SECONDS) stopRecording();
        return next;
      });
    }, 1000);
  }, [stopRecording]);

  useEffect(() => () => { clearTimer(); releaseStream(); }, []);

  return { isRecording, startRecording, stopRecording, audioBase64, mimeType, error, secondsElapsed };
}
