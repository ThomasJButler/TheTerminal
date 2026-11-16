/**
 * Talking and listening, through the browser's own Web Speech API.
 *
 * Synthesis runs on the device. Recognition is the browser's business: Chrome and Safari
 * may send the audio to Google or Apple to be transcribed, which the operator says before
 * it listens. Neither part touches this site, because there is no server here to touch.
 */

interface RecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export const canListen = () => Boolean(recognitionCtor());

function voice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'en-GB') ?? voices.find((v) => v.lang.startsWith('en'));
}

/** Say something. `done` fires when it has finished, or straight away if it cannot start. */
export function speak(text: string, done?: () => void) {
  if (!canSpeak()) {
    done?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const chosen = voice();
  if (chosen) utterance.voice = chosen;
  utterance.lang = chosen?.lang ?? 'en-GB';
  utterance.rate = 0.98;
  utterance.pitch = 0.85;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    done?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  synth.speak(utterance);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export interface Listening {
  onText: (text: string) => void;
  /** The recogniser's own error code: 'not-allowed', 'no-speech', 'network', and so on. */
  onError: (code: string) => void;
  onEnd: () => void;
}

/** Listen for one utterance. Returns a function that stops listening. */
export function listen({ onText, onError, onEnd }: Listening): () => void {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    onError('unsupported');
    onEnd();
    return () => {};
  }
  const recognition = new Ctor();
  recognition.lang = 'en-GB';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;
  let heard = false;
  let stopped = false;
  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const text = result?.[0]?.transcript.trim();
    if (text) {
      heard = true;
      onText(text);
    }
  };
  recognition.onerror = (event) => {
    heard = true;
    onError(event.error);
  };
  recognition.onend = () => {
    // Silence is worth mentioning. Being told to stop is not.
    if (!heard && !stopped) onError('no-speech');
    onEnd();
  };
  try {
    recognition.start();
  } catch {
    onError('unavailable');
    onEnd();
  }
  return () => {
    stopped = true;
    recognition.abort();
  };
}

const EXPLAIN: Record<string, string> = {
  'not-allowed': 'The microphone is blocked for this site. Allow it from the address bar, or just type.',
  'service-not-allowed': 'This browser will not let the page use speech recognition. You can still type.',
  'audio-capture': 'No microphone was found. You can still type.',
  network: "The browser's speech service could not be reached. You can still type.",
  'no-speech': "I didn't hear anything. TALK tries again.",
  unsupported: 'This browser has no speech recognition. Chrome, Edge and Safari do.',
  unavailable: 'Speech recognition would not start. You can still type.',
};

/** A sentence for an error code, or nothing if it is not worth mentioning. */
export function explain(code: string): string | null {
  if (code === 'aborted') return null;
  return EXPLAIN[code] ?? `Speech recognition stopped (${code}). You can still type.`;
}
