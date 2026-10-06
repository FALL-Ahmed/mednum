"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "./supabase";

const TARGET_RATE = 16000; // 16 kHz mono : le format idéal pour la reconnaissance vocale
const MAX_SECONDS = 120;

export type VoiceLang = "auto" | "fr" | "ar";

export class VoiceError extends Error {
  constructor(public code: "denied" | "unsupported" | "not_configured" | "quota" | "failed") {
    super(code);
  }
}

export type Recording = {
  blob: Blob; // WAV 16 kHz mono, volume normalisé, silences rognés
  seconds: number; // durée utile
  peak: number; // niveau maximal capté avant normalisation (0 à 1)
  snrDb: number; // écart entre la voix et le bruit de fond, estimé
};

/** Envoie un enregistrement à la fonction serveur `transcribe` et renvoie le texte. */
export async function transcribe(blob: Blob, language: VoiceLang = "auto"): Promise<string> {
  const sb = getSupabase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!sb || !url || !anon) throw new VoiceError("not_configured");
  const { data } = await sb.auth.getSession();
  if (!data.session) throw new VoiceError("failed");

  const form = new FormData();
  form.append("file", blob, "voix.wav");
  form.append("language", language);

  const res = await fetch(`${url}/functions/v1/transcribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: anon },
    body: form,
  });
  if (res.status === 429) throw new VoiceError("quota");
  if (res.status === 503 || res.status === 404) throw new VoiceError("not_configured");
  if (!res.ok) throw new VoiceError("failed");
  const out = (await res.json()) as { text?: string };
  return (out.text ?? "").trim();
}

/* ——— Traitement du son ——— */

function concat(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Ramène le son à 16 kHz en moyennant les échantillons (filtre simple contre le repliement). */
function resample(input: Float32Array, inRate: number): Float32Array {
  if (inRate === TARGET_RATE) return input;
  const ratio = inRate / TARGET_RATE;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / (end - start);
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

function encodeWav(samples: Float32Array): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, TARGET_RATE, true);
  v.setUint32(28, TARGET_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/**
 * Nettoie l'enregistrement avant l'envoi : 16 kHz mono, composante continue retirée, silences de début et de fin
 * rognés, volume remonté (une voix faible est l'une des premières causes de mauvaise transcription).
 */
export function processRecording(chunks: Float32Array[], inRate: number): Recording | null {
  const raw = resample(concat(chunks), inRate);
  if (raw.length < TARGET_RATE * 0.2) return null;

  let mean = 0;
  for (let i = 0; i < raw.length; i++) mean += raw[i];
  mean /= raw.length;
  let peak = 0;
  for (let i = 0; i < raw.length; i++) {
    raw[i] -= mean;
    peak = Math.max(peak, Math.abs(raw[i]));
  }

  // Énergie par tranche de 20 ms
  const frame = Math.round(TARGET_RATE * 0.02);
  const rms: number[] = [];
  for (let s = 0; s + frame <= raw.length; s += frame) {
    let e = 0;
    for (let i = s; i < s + frame; i++) e += raw[i] * raw[i];
    rms.push(Math.sqrt(e / frame));
  }
  const sorted = [...rms].sort((a, b) => a - b);
  const noise = Math.max(percentile(sorted, 0.1), 1e-5);
  const speech = percentile(sorted, 0.9);
  const snrDb = 20 * Math.log10(Math.max(speech, 1e-5) / noise);

  // Rogner les silences (avec 0,25 s de marge)
  const gate = Math.max(noise * 3, speech * 0.12);
  let first = rms.findIndex((r) => r > gate);
  let last = rms.length - 1 - [...rms].reverse().findIndex((r) => r > gate);
  if (first < 0) {
    first = 0;
    last = rms.length - 1;
  }
  const pad = 12;
  const from = Math.max(0, first - pad) * frame;
  const to = Math.min(rms.length, last + 1 + pad) * frame;
  const trimmed = raw.slice(from, to);

  // Volume : on vise un pic à ~0,85 sans amplifier plus de 25 fois
  const gain = peak > 0 ? Math.min(0.85 / peak, 25) : 1;
  if (gain > 1.05) for (let i = 0; i < trimmed.length; i++) trimmed[i] *= gain;

  return { blob: encodeWav(trimmed), seconds: trimmed.length / TARGET_RATE, peak, snrDb };
}

/* ——— Enregistrement du micro ——— */

const WORKLET_SRC = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(new Float32Array(ch));
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

/**
 * Enregistre le micro en PCM brut (pas de compression avec perte) puis le prépare pour la transcription.
 * `level` (0 à 1) indique en direct si le micro capte la voix. S'arrête seul après 2 minutes.
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<AudioNode | null>(null);
  const chunks = useRef<Float32Array[]>([]);
  const timer = useRef<number | null>(null);
  const lastLevelAt = useRef(0);
  const rate = useRef(TARGET_RATE);
  const stopRef = useRef<(() => Promise<Recording | null>) | null>(null);

  const teardown = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    nodeRef.current?.disconnect();
    nodeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setRecording(false);
    setSeconds(0);
    setLevel(0);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const onChunk = useCallback((data: Float32Array) => {
    chunks.current.push(data);
    const now = performance.now();
    if (now - lastLevelAt.current > 90) {
      lastLevelAt.current = now;
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
      setLevel(Math.min(1, peak * 3));
    }
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      throw new VoiceError("unsupported");
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      throw new VoiceError("denied");
    }
    streamRef.current = stream;
    chunks.current = [];

    const ctx = new AudioContext();
    ctxRef.current = ctx;
    rate.current = ctx.sampleRate;
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);

    if (ctx.audioWorklet) {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const node = new AudioWorkletNode(ctx, "pcm-capture");
      node.port.onmessage = (e: MessageEvent<Float32Array>) => onChunk(e.data);
      source.connect(node);
      nodeRef.current = node;
    } else {
      // Navigateurs sans AudioWorklet : ancienne méthode, toujours prise en charge
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => onChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(node);
      node.connect(ctx.destination);
      nodeRef.current = node;
    }

    setRecording(true);
    const t0 = Date.now();
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) stopRef.current?.();
    }, 500);
  }, [onChunk]);

  /** Termine l'enregistrement et renvoie le son préparé (null s'il est vide). */
  const stop = useCallback(async (): Promise<Recording | null> => {
    if (!ctxRef.current) return null;
    const data = chunks.current;
    const inRate = rate.current;
    teardown();
    chunks.current = [];
    return processRecording(data, inRate);
  }, [teardown]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  /** Annule sans rien garder. */
  const cancel = useCallback(() => {
    chunks.current = [];
    teardown();
  }, [teardown]);

  return { recording, seconds, level, start, stop, cancel };
}
