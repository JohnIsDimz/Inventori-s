/**
 * Input suara Bahasa Indonesia.
 *
 * Membungkus `expo-speech-recognition` supaya pemakaian di layar cukup:
 *
 *   const voice = useVoiceInput({ onResult: (teks) => ... });
 *   voice.start();  voice.stop();  voice.state  voice.error
 *
 * Web memakai Web Speech API bawaan browser (Chrome/Edge); iOS memakai
 * Speech framework; Android memakai Google Speech Services. Bila perangkat
 * tidak punya layanan pengenalan suara, `error` berisi petunjuk dan UI tetap
 * bisa dipakai manual.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'error';

export interface VoiceInputOptions {
  /** Teks hasil akhir (sudah final). */
  onResult: (transcript: string) => void;
  /** Teks sementara saat pengguna masih berbicara. */
  onPartial?: (transcript: string) => void;
  lang?: string;
}

export function useVoiceInput({ onResult, onPartial, lang = 'id-ID' }: VoiceInputOptions) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const resultRef = useRef(onResult);
  const partialRef = useRef(onPartial);
  resultRef.current = onResult;
  partialRef.current = onPartial;

  useSpeechRecognitionEvent('result', (event) => {
    clearWatchdog();
    const text = event.results?.[0]?.transcript?.trim() ?? '';
    if (!text) return;
    setTranscript(text);
    partialRef.current?.(text);
    if (event.isFinal) {
      setState('processing');
      resultRef.current(text);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    clearWatchdog();
    setState('error');
    setError(explainError(event.error, event.message));
  });

  useSpeechRecognitionEvent('end', () => {
    clearWatchdog();
    setState((prev) => (prev === 'error' ? prev : 'idle'));
  });

  useEffect(() => {
    return () => {
      if (Platform.OS === 'web') return;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Modul belum siap — abaikan.
      }
    };
  }, []);

  // Pengaman: bila tidak ada hasil/kesalahan sama sekali (mis. perangkat tanpa
  // layanan suara atau mikrofon diblokir), jangan biarkan tombol "mendengarkan"
  // menggantung selamanya.
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearWatchdog = useCallback(() => {
    if (watchdog.current) {
      clearTimeout(watchdog.current);
      watchdog.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setTranscript('');
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setState('error');
        setError('Izin mikrofon diperlukan untuk input suara.');
        return;
      }
      setState('listening');
      clearWatchdog();
      watchdog.current = setTimeout(() => {
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {
          // abaikan
        }
        setState('error');
        setError('Tidak ada suara terdeteksi. Ketuk mikrofon lalu bicara lebih dekat.');
      }, 15000);
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
        androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'free_form' },
      });
    } catch (err) {
      setState('error');
      if (__DEV__) console.warn('[suara]', err);
      setError('Pengenalan suara belum bisa dimulai. Coba lagi atau ketik manual.');
    }
  }, [lang, clearWatchdog]);

  const stop = useCallback(() => {
    clearWatchdog();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Diamkan: penghentian saat tidak ada rekaman bukan masalah.
    }
    setState('idle');
  }, [clearWatchdog]);

  return { state, error, transcript, start, stop, isListening: state === 'listening' };
}

/**
 * Semua pesan yang tampil memakai bahasa Indonesia. Pesan asli dari mesin
 * pengenalan suara hanya masuk log, karena biasanya berbahasa Inggris dan
 * membingungkan pembeli.
 */
function explainError(code?: string, message?: string): string {
  if (__DEV__ && message) console.warn('[suara]', code, message);
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Akses mikrofon/pengenalan suara ditolak. Aktifkan di pengaturan sistem.';
  }
  if (code === 'no-speech' || code === 'speech-timeout') {
    return 'Belum ada suara terdeteksi. Coba lagi lebih dekat ke mikrofon.';
  }
  if (code === 'network') {
    return 'Pengenalan suara butuh koneksi internet di perangkat ini.';
  }
  if (code === 'language-not-supported') {
    return 'Pengenalan suara Bahasa Indonesia belum aktif di HP ini. Ketik manual saja.';
  }
  return 'Pengenalan suara belum berhasil. Coba lagi atau ketik manual.';
}
