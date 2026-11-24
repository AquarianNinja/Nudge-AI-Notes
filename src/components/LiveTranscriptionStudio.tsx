import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  FileAudio,
  Keyboard,
  Languages,
  Mic,
  Plus,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type {
  AppSettings,
  DictationMode,
  DictationPipelineState,
  LocalSttBackendKind
} from '../types/index.ts';
import {
  SUPPORTED_DICTATION_LANGUAGES,
  loadDictationModes,
  resolveActiveDictationMode
} from '../utils/dictationModes.ts';
import { getUnifiedModelById, UNIFIED_MODELS } from '../utils/modelRegistry.ts';
import { isLocalOnlyActive, subscribeNetworkFirewall } from '../utils/networkGateway.ts';
import {
  executeDictationPipeline,
  type DictationPipelineExecutionResult
} from '../utils/localSttEngine.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS, MOTION_TRANSITIONS } from '../utils/motion.ts';
import type { HubTabId } from './ModelAudioHubView.tsx';

export interface StudioStreamTurn {
  id: string;
  timestamp: string;
  detectedLang: string;
  targetLang: string;
  sourceText: string;
  translatedText?: string;
  modeName: string;
  sttModelName: string;
  backend: LocalSttBackendKind;
  durationSec: number;
  audioUrl?: string;
  triggeredByVoice?: boolean;
}

interface LiveTranscriptionStudioProps {
  settings: AppSettings;
  onUpdateSettings?: (patch: Partial<AppSettings>) => void;
  onOpenHub?: (tab?: HubTabId) => void;
  onOpenSettings?: () => void;
  onCompletedDictation?: (result: DictationPipelineExecutionResult) => void;
  onInsertDictatedText?: (text: string) => void;
  onLearnTerms?: (text: string, sourceFile: string) => void;
  onCreateSessionFromStream: (payload: {
    turns: StudioStreamTurn[];
    combinedSourceText: string;
    combinedTranslatedText: string;
    totalDurationSec: number;
    latestAudioUrl?: string;
  }) => void;
}

export const LiveTranscriptionStudio: React.FC<LiveTranscriptionStudioProps> = ({
  settings,
  onUpdateSettings,
  onOpenHub,
  onOpenSettings,
  onCompletedDictation,
  onInsertDictatedText,
  onLearnTerms,
  onCreateSessionFromStream
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [pipelineState, setPipelineState] = useState<DictationPipelineState>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [rmsBars, setRmsBars] = useState<number[]>(() => Array(12).fill(0.18));
  const [partialSourceText, setPartialSourceText] = useState('');
  const [statusDetail, setStatusDetail] = useState('');
  const [backendLabel, setBackendLabel] = useState<LocalSttBackendKind | null>(null);
  const [turns, setTurns] = useState<StudioStreamTurn[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blockedCount, setBlockedCount] = useState(0);
  const [showTextComposer, setShowTextComposer] = useState(false);
  const [draftSpeech, setDraftSpeech] = useState('');
  const [copiedPane, setCopiedPane] = useState<'none' | 'a' | 'b' | 'both'>('none');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMsRef = useRef<number>(0);

  const localOnly = isLocalOnlyActive(settings);
  const modes = useMemo(
    () => loadDictationModes(settings.dictationModes),
    [settings.dictationModes]
  );
  const activeMode = useMemo(
    () => resolveActiveDictationMode(modes, settings.activeDictationModeId),
    [modes, settings.activeDictationModeId]
  );
  const activeStt =
    getUnifiedModelById(settings.activeSttModelId) || UNIFIED_MODELS[0];

  const translationEnabled = Boolean(settings.translationEnabled);
  const sourceLang = settings.translationSourceLang || activeMode.sourceLang || 'Auto-detect';
  const targetLang = settings.translationTargetLang || activeMode.targetLang || 'Spanish';

  useEffect(() => {
    const unsub = subscribeNetworkFirewall((ev) => setBlockedCount(ev.blockedCount));
    return unsub;
  }, []);

  const stopStreamResources = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setRmsBars(Array(12).fill(0.18));
  };

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore cleanup stop
        }
      }
      stopStreamResources();
    };
  }, []);

  const formatDurationClock = (sec: number): string => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const runPipeline = async (opts: {
    audioBlob?: Blob;
    textInputOverride?: string;
    durationSec?: number;
  }) => {
    setPipelineState('processing');
    setErrorMsg(null);
    setStatusDetail('Streaming ASR & A->B translation...');

    let audioUrl: string | undefined;
    if (opts.audioBlob) {
      try {
        audioUrl = URL.createObjectURL(opts.audioBlob);
      } catch {
        audioUrl = undefined;
      }
    }

    try {
      const execResult = await executeDictationPipeline({
        audioBlob: opts.audioBlob,
        textInputOverride: opts.textInputOverride,
        durationSec: opts.durationSec,
        settings,
        mode: activeMode,
        translationEnabled,
        sourceLang,
        targetLang,
        onPartial: (text, backend, detail) => {
          if (text) setPartialSourceText(text);
          setBackendLabel(backend);
          if (detail) setStatusDetail(detail);
        }
      });

      const stamp = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const newTurn: StudioStreamTurn = {
        id: `studio-turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: stamp,
        detectedLang: execResult.detectedLang || sourceLang,
        targetLang,
        sourceText: execResult.finalText,
        translatedText: execResult.translatedText,
        modeName: execResult.matchedMode.name,
        sttModelName: execResult.sttModelName,
        backend: execResult.backend,
        durationSec: execResult.durationSec,
        audioUrl,
        triggeredByVoice: execResult.triggeredByVoice
      };

      setTurns((prev) => [...prev, newTurn]);
      setPartialSourceText('');
      setBackendLabel(execResult.backend);
      setPipelineState('ready');
      setStatusDetail('');
      onCompletedDictation?.(execResult);
      onLearnTerms?.(
        [execResult.finalText, execResult.translatedText || ''].join(' ').trim(),
        `live-studio-${execResult.matchedMode.id}`
      );
      triggerHaptic('success');

      if (execResult.matchedMode.outputAction === 'copy') {
        const out = execResult.translatedText || execResult.finalText;
        void navigator.clipboard?.writeText(out).catch(() => undefined);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Realtime transcription failed');
      setPipelineState('error');
      setStatusDetail('');
      triggerHaptic('warning');
    }
  };

  const handleStartRecording = async () => {
    setErrorMsg(null);
    setPartialSourceText('');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setPipelineState('mic-denied');
      setShowTextComposer(true);
      setErrorMsg('Microphone API unavailable here. Upload an audio clip or type a speech turn below.');
      triggerHaptic('warning');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        const dur = Math.max(1, Math.round((Date.now() - startMsRef.current) / 1000));
        stopStreamResources();
        if (blob.size === 0) {
          setPipelineState('error');
          setErrorMsg('Captured empty audio buffer.');
          return;
        }
        void runPipeline({ audioBlob: blob, durationSec: dur });
      };

      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          const freq = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(freq);
            const nextBars = Array.from({ length: 12 }, (_, idx) => {
              const v = freq[idx * 2] || 0;
              return Math.max(0.18, Math.min(1, v / 170));
            });
            setRmsBars(nextBars);
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        }
      } catch {
        // Fallback when AudioContext is restricted
      }

      startMsRef.current = Date.now();
      setElapsedSec(0);
      timerRef.current = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startMsRef.current) / 1000));
      }, 500);

      recorder.start(250);
      setPipelineState('recording');
      triggerHaptic('medium');
    } catch {
      stopStreamResources();
      setPipelineState('mic-denied');
      setShowTextComposer(true);
      setErrorMsg('Microphone permission denied or hardware missing. Upload audio or type speech below.');
      triggerHaptic('warning');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      triggerHaptic('light');
    }
  };

  const handleAudioFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void runPipeline({ audioBlob: file, durationSec: 4 });
  };

  const handleTextTurnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draftSpeech.trim();
    if (!clean) return;
    setDraftSpeech('');
    void runPipeline({
      textInputOverride: clean,
      durationSec: Math.max(2, Math.ceil(clean.split(/\s+/).length / 3))
    });
  };

  const combinedSourceText = useMemo(
    () => turns.map((t) => `[${t.timestamp}] ${t.sourceText}`).join('\n'),
    [turns]
  );

  const combinedTranslatedText = useMemo(
    () =>
      turns
        .map((t) => `[${t.timestamp}] ${t.translatedText || t.sourceText}`)
        .join('\n'),
    [turns]
  );

  const totalDurationSec = useMemo(
    () => turns.reduce((acc, t) => acc + t.durationSec, 0),
    [turns]
  );

  const handleCopyStream = (which: 'a' | 'b' | 'both') => {
    if (turns.length === 0) return;
    const text =
      which === 'a'
        ? combinedSourceText
        : which === 'b'
          ? combinedTranslatedText
          : turns
              .map(
                (t) =>
                  `[${t.timestamp}] (${t.detectedLang}): ${t.sourceText}${
                    t.translatedText ? `\n  → (${t.targetLang}): ${t.translatedText}` : ''
                  }`
              )
              .join('\n\n');
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopiedPane(which);
    triggerHaptic('selection');
    setTimeout(() => setCopiedPane('none'), 1500);
  };

  const handleCreateSession = () => {
    if (turns.length === 0) return;
    triggerHaptic('success');
    const latestWithAudio = [...turns].reverse().find((t) => t.audioUrl);
    onCreateSessionFromStream({
      turns,
      combinedSourceText,
      combinedTranslatedText,
      totalDurationSec: Math.max(10, totalDurationSec),
      latestAudioUrl: latestWithAudio?.audioUrl
    });
  };

  return (
    <section
      data-testid="live-transcription-studio"
      aria-label="Live Transcription Studio"
      className="@container space-y-3"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg"
        onChange={handleAudioFileUpload}
        className="hidden"
      />

      {/* Studio Control Deck */}
      <div className="p-3 sm:p-4 rounded-2xl liquid-glass-elevated border border-white/12 space-y-2.5">
        {/* Top Metadata + Config Entry */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <Radio
                className={`w-4 h-4 shrink-0 ${
                  pipelineState === 'recording' ? 'text-rose-400 animate-pulse' : 'text-[#54B0FF]'
                }`}
              />
              <h3 className="text-xs sm:text-sm font-semibold text-zinc-50 tracking-tight truncate">
                Live Transcription Studio
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-mono text-zinc-400 tabular-nums">
              <span className="text-zinc-200 truncate">{activeStt.name}</span>
              <span aria-hidden="true">·</span>
              <span className={translationEnabled ? 'text-[#54B0FF]' : 'text-zinc-400'}>
                {translationEnabled ? `${sourceLang} → ${targetLang}` : activeMode.name}
              </span>
              {localOnly && (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    data-testid="studio-local-only-indicator"
                    className="inline-flex items-center gap-1 text-emerald-300 font-semibold"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    Local-Only
                    {blockedCount > 0 ? ` (${blockedCount})` : ''}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            data-testid="studio-open-hub-btn"
            onClick={() => {
              triggerHaptic('selection');
              if (onOpenHub) {
                onOpenHub('models');
              } else {
                onOpenSettings?.();
              }
            }}
            className="min-h-[38px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-200 transition-colors whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#54B0FF]" />
            <span>Models</span>
          </button>
        </div>

        {/* Capture Controls & Waveform Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {pipelineState === 'recording' ? (
              <motion.button
                type="button"
                data-testid="studio-stop-btn"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                onClick={handleStopRecording}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold shadow-[0_0_20px_rgba(244,63,94,0.4)] transition-colors whitespace-nowrap shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span className="font-mono tabular-nums">
                  Stop · {formatDurationClock(elapsedSec)}
                </span>
              </motion.button>
            ) : (
              <motion.button
                type="button"
                data-testid="studio-mic-btn"
                whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                transition={MOTION_SPRINGS.interactive}
                disabled={pipelineState === 'processing'}
                onClick={() => void handleStartRecording()}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl liquid-accent-glass text-xs font-semibold disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Mic className="w-4 h-4" />
                <span>
                  {pipelineState === 'processing' ? 'Transcribing...' : 'Start Live'}
                </span>
              </motion.button>
            )}

            {/* Real-Time Acoustic Level Bars */}
            <div
              aria-hidden="true"
              className="flex items-center gap-1 h-7 px-2 rounded-xl bg-black/30 border border-white/10"
            >
              {rmsBars.slice(0, 8).map((level, idx) => (
                <span
                  key={idx}
                  className={`w-1 rounded-full transition-all duration-75 ${
                    pipelineState === 'recording' ? 'bg-[#54B0FF]' : 'bg-white/20'
                  }`}
                  style={{ height: `${Math.max(4, Math.round(level * 18))}px` }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="studio-upload-audio-btn"
              disabled={pipelineState === 'recording' || pipelineState === 'processing'}
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-200 disabled:opacity-45 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-[#54B0FF]" />
              <span>Audio</span>
            </button>

            <button
              type="button"
              data-testid="studio-toggle-text-composer"
              onClick={() => {
                triggerHaptic('selection');
                setShowTextComposer((v) => !v);
              }}
              className={`min-h-[38px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-medium transition-colors whitespace-nowrap ${
                showTextComposer
                  ? 'bg-[#0F7FFF]/22 border-[#54B0FF]/50 text-white'
                  : 'liquid-glass-subtle border-white/10 text-zinc-200 hover:bg-white/10'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5 text-[#54B0FF]" />
              <span>Type Turn</span>
            </button>

            {turns.length > 0 && (
              <button
                type="button"
                data-testid="studio-clear-stream-btn"
                onClick={() => {
                  triggerHaptic('selection');
                  setTurns([]);
                  setPartialSourceText('');
                  setErrorMsg(null);
                }}
                aria-label="Clear live stream turns"
                className="min-h-[38px] min-w-[38px] inline-flex items-center justify-center px-2 py-1.5 rounded-xl liquid-glass-subtle hover:bg-rose-500/15 text-zinc-400 hover:text-rose-300 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Dictation Mode Strip + Compact Dual A->B Language Row */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
            {modes.map((m: DictationMode) => {
              const active = m.id === activeMode.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    onUpdateSettings?.({
                      activeDictationModeId: m.id,
                      ...(m.translateEnabled ? { translationEnabled: true } : {})
                    });
                  }}
                  className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#0F7FFF] border-[#0F7FFF] text-white'
                      : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              data-testid="studio-toggle-translation"
              aria-pressed={translationEnabled}
              onClick={() => {
                triggerHaptic('selection');
                onUpdateSettings?.({ translationEnabled: !translationEnabled });
              }}
              className={`min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 ${
                translationEnabled
                  ? 'bg-[#0F7FFF]/25 border-[#54B0FF]/60 text-white'
                  : 'liquid-glass-subtle border-white/10 text-zinc-300 hover:bg-white/10'
              }`}
            >
              <Languages className="w-3.5 h-3.5 text-[#54B0FF]" />
              <span>A→B</span>
            </button>

            <div className="flex-1 min-w-[200px] flex items-center justify-between gap-1.5 px-2.5 py-1 rounded-xl bg-black/30 border border-white/10 text-[11px]">
              <select
                aria-label="Source Language A"
                value={sourceLang}
                onChange={(e) =>
                  onUpdateSettings?.({ translationSourceLang: e.target.value })
                }
                className="bg-transparent text-zinc-200 focus:outline-none min-h-[28px] max-w-[44%]"
              >
                {SUPPORTED_DICTATION_LANGUAGES.map((l) => (
                  <option key={l} value={l} className="bg-zinc-900">
                    {l}
                  </option>
                ))}
              </select>
              <ArrowRight className="w-3 h-3 text-zinc-500 shrink-0" />
              <select
                aria-label="Target Language B"
                value={targetLang}
                disabled={!translationEnabled}
                onChange={(e) =>
                  onUpdateSettings?.({ translationTargetLang: e.target.value })
                }
                className="bg-transparent text-white font-medium focus:outline-none disabled:opacity-45 min-h-[28px] max-w-[44%]"
              >
                {SUPPORTED_DICTATION_LANGUAGES.filter((l) => l !== 'Auto-detect').map((l) => (
                  <option key={l} value={l} className="bg-zinc-900">
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Typed Turn / Voice Trigger Composer */}
        <AnimatePresence initial={false}>
          {(showTextComposer || pipelineState === 'mic-denied') && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto', transition: MOTION_TRANSITIONS.elementEnter }}
              exit={{ opacity: 0, height: 0, transition: MOTION_TRANSITIONS.elementExit }}
              onSubmit={handleTextTurnSubmit}
              className="flex flex-wrap sm:flex-nowrap items-center gap-2 pt-1"
            >
              <input
                type="text"
                data-testid="studio-speech-input"
                value={draftSpeech}
                onChange={(e) => setDraftSpeech(e.target.value)}
                placeholder='Enter spoken turn or voice trigger (e.g. "translate: confirm FNOL subrogation reserve cap")'
                className="flex-1 min-w-[200px] min-h-[42px] rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#54B0FF]"
              />
              <button
                type="submit"
                data-testid="studio-speech-submit"
                disabled={!draftSpeech.trim() || pipelineState === 'processing'}
                className="min-h-[42px] px-4 py-2 rounded-xl liquid-accent-glass text-xs font-semibold disabled:opacity-45 whitespace-nowrap shrink-0"
              >
                Stream Turn
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Error Alert */}
        {errorMsg && (
          <div
            data-testid="studio-error-banner"
            className="rounded-xl bg-rose-500/15 border border-rose-400/35 px-3 py-2 flex items-center justify-between gap-2 text-xs text-rose-100"
          >
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              aria-label="Dismiss error"
              className="min-h-[32px] min-w-[32px] flex items-center justify-center text-rose-200 hover:text-white shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Dual A -> B Real-Time Stream Panes */}
      <div className="grid grid-cols-1 @[560px]:grid-cols-2 gap-3">
        {/* Pane A: Live Source Stream */}
        <div
          data-testid="studio-stream-pane-a"
          className="rounded-2xl liquid-glass border border-white/10 p-3.5 flex flex-col gap-2.5 min-h-[240px]"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                Stream A · Source Speech
              </div>
              <div className="text-xs font-semibold text-zinc-100 truncate">
                {sourceLang}
              </div>
            </div>

            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => handleCopyStream('a')}
                className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-zinc-300 shrink-0"
              >
                {copiedPane === 'a' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedPane === 'a' ? 'Copied' : 'Copy A'}</span>
              </button>
            )}
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[360px] pr-0.5">
            {pipelineState === 'recording' && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-400/25 text-xs text-rose-100 space-y-1">
                <div className="text-[10px] font-mono uppercase text-rose-300">
                  ● Capturing Live Audio · {formatDurationClock(elapsedSec)}
                </div>
                <p className="text-zinc-200">
                  Listening via {activeStt.name}. Tap Stop when finished to emit next turn.
                </p>
              </div>
            )}

            {pipelineState === 'processing' && (
              <div className="p-2.5 rounded-xl bg-[#0F7FFF]/10 border border-[#54B0FF]/30 text-xs space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-[#54B0FF]">
                  <span>{statusDetail || 'Streaming partial buffer...'}</span>
                  {backendLabel && <span className="uppercase">{backendLabel}</span>}
                </div>
                {partialSourceText && (
                  <p className="text-zinc-100 leading-relaxed">{partialSourceText}</p>
                )}
              </div>
            )}

            {turns.length === 0 && pipelineState !== 'recording' && pipelineState !== 'processing' ? (
              <div className="h-full min-h-[150px] flex flex-col items-center justify-center text-center px-4 py-6 gap-2 text-zinc-400">
                <FileAudio className="w-6 h-6 text-[#54B0FF]/80" />
                <p className="text-xs text-zinc-300 font-medium">
                  Ready for realtime dictation
                </p>
                <p className="text-[11px] text-zinc-400 max-w-xs leading-relaxed">
                  Tap Start Live Mic, drop an audio clip, or use Type Turn to stream speech into Stream A and translate into Stream B.
                </p>
              </div>
            ) : (
              turns.map((turn) => (
                <article
                  key={turn.id}
                  data-testid="studio-turn-source"
                  className="pb-2.5 border-b border-white/10 last:border-b-0 last:pb-0 space-y-1"
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-zinc-400 tabular-nums">
                    <span className="text-zinc-300">{turn.timestamp}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#54B0FF]">{turn.detectedLang}</span>
                    <span aria-hidden="true">·</span>
                    <span>{turn.modeName}</span>
                    {turn.triggeredByVoice && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-purple-300">Voice Trigger</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="uppercase">{turn.backend}</span>
                  </div>
                  <p className="text-xs text-zinc-100 leading-relaxed">{turn.sourceText}</p>
                </article>
              ))
            )}
          </div>
        </div>

        {/* Pane B: Live Translated Target Stream */}
        <div
          data-testid="studio-stream-pane-b"
          className={`rounded-2xl liquid-glass border p-3.5 flex flex-col gap-2.5 min-h-[240px] ${
            translationEnabled ? 'border-[#0F7FFF]/35' : 'border-white/10'
          }`}
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
            <div className="min-w-0">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#54B0FF]">
                Stream B · {translationEnabled ? 'Live Translation' : 'Mode Output'}
              </div>
              <div className="text-xs font-semibold text-zinc-100 truncate">
                {translationEnabled ? targetLang : 'Translation Paused (Mirroring A)'}
              </div>
            </div>

            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => handleCopyStream('b')}
                className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-zinc-300 shrink-0"
              >
                {copiedPane === 'b' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedPane === 'b' ? 'Copied' : 'Copy B'}</span>
              </button>
            )}
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[360px] pr-0.5">
            {!translationEnabled && turns.length === 0 ? (
              <div className="h-full min-h-[150px] flex flex-col items-center justify-center text-center px-4 py-6 gap-2.5">
                <Languages className="w-6 h-6 text-[#54B0FF]/80" />
                <p className="text-xs text-zinc-300 font-medium">
                  Dual A→B translation is off
                </p>
                <p className="text-[11px] text-zinc-400 max-w-xs leading-relaxed">
                  Turn on A→B Stream to translate every captured turn from {sourceLang} into {targetLang} in real time.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    onUpdateSettings?.({ translationEnabled: true });
                  }}
                  className="min-h-[40px] px-3.5 py-1.5 rounded-xl liquid-accent-glass text-xs font-semibold"
                >
                  Enable Live Translation
                </button>
              </div>
            ) : turns.length === 0 ? (
              <div className="h-full min-h-[150px] flex flex-col items-center justify-center text-center px-4 py-6 gap-2 text-zinc-400">
                <Sparkles className="w-6 h-6 text-[#54B0FF]/80" />
                <p className="text-xs text-zinc-300 font-medium">
                  Awaiting {sourceLang} → {targetLang} turns
                </p>
                <p className="text-[11px] text-zinc-400 max-w-xs leading-relaxed">
                  Translated lines synchronize here side-by-side with Stream A as each turn completes.
                </p>
              </div>
            ) : (
              turns.map((turn) => (
                <article
                  key={`${turn.id}-target`}
                  data-testid="studio-turn-target"
                  className="pb-2.5 border-b border-white/10 last:border-b-0 last:pb-0 space-y-1"
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-zinc-400 tabular-nums">
                    <span className="text-zinc-300">{turn.timestamp}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#54B0FF]">
                      {turn.translatedText ? turn.targetLang : 'Same Language'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{turn.sttModelName}</span>
                  </div>
                  <p className="text-xs text-white leading-relaxed">
                    {turn.translatedText || turn.sourceText}
                  </p>
                </article>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Commit Dual Stream into Meeting Session or Note */}
      {turns.length > 0 && (
        <div className="p-3 rounded-2xl liquid-glass border border-white/10 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-mono text-zinc-300 tabular-nums">
            {turns.length} {turns.length === 1 ? 'turn' : 'turns'} captured · {totalDurationSec}s audio
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleCopyStream('both')}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-200"
            >
              {copiedPane === 'both' ? (
                <Check className="w-3.5 h-3.5 text-emerald-300" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedPane === 'both' ? 'Copied A+B' : 'Copy A+B'}</span>
            </button>

            {onInsertDictatedText && (
              <button
                type="button"
                data-testid="studio-save-diary-btn"
                onClick={() => {
                  const payload = turns
                    .map((t) =>
                      t.translatedText
                        ? `${t.sourceText}\n[${t.targetLang}]: ${t.translatedText}`
                        : t.sourceText
                    )
                    .join('\n\n');
                  onInsertDictatedText(payload);
                  triggerHaptic('success');
                }}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-100"
              >
                <span>Save to Office Diary</span>
              </button>
            )}

            <button
              type="button"
              data-testid="studio-create-session-btn"
              onClick={handleCreateSession}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl liquid-accent-glass text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Meeting Session</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
