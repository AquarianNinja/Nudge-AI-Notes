import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Copy,
  Cpu,
  Download,
  Eye,
  EyeOff,
  FileDown,
  History,
  KeyRound,
  Languages,
  Lock,
  Mic,
  Plus,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  WifiOff,
  X
} from 'lucide-react';
import type {
  AppSettings,
  DictationHistoryEntry,
  DictationHistoryRetention,
  DictationMode,
  DictationOutputAction,
  PaidProviderId,
  UnifiedModelSpec
} from '../types/index.ts';
import {
  UNIFIED_MODELS,
  deleteCachedModelWeights,
  downloadLocalModelWeights,
  filterUnifiedModels,
  getCachedModelIds,
  getUnifiedModelById,
  resolveModelAvailability
} from '../utils/modelRegistry.ts';
import {
  gatewayFetch,
  isLocalOnlyActive,
  isLoopbackOrPrivateUrl,
  subscribeNetworkFirewall
} from '../utils/networkGateway.ts';
import {
  DEFAULT_DICTATION_MODES,
  SUPPORTED_DICTATION_LANGUAGES,
  loadDictationModes,
  resolveActiveDictationMode,
  saveCustomDictationModes
} from '../utils/dictationModes.ts';
import {
  formatHistoryEntryAsMarkdown,
  formatHistoryEntryAsSrt,
  formatHistoryEntryAsTxt,
  formatHistoryEntryAsVtt,
  searchDictationHistory
} from '../utils/dictationHistory.ts';
import { detectLocalSttCapabilities, type LocalSttCapabilities } from '../utils/localSttEngine.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MotionSheet } from './MotionPrimitives.tsx';

export type HubTabId = 'models' | 'modes' | 'keys' | 'history';

interface ModelAudioHubViewProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  historyEntries: DictationHistoryEntry[];
  onDeleteHistoryEntry: (entryId: string) => void;
  onWipeHistory: () => void;
  onInsertText?: (text: string) => void;
  initialTab?: HubTabId;
  mode?: 'embedded' | 'modal';
  isOpen?: boolean;
  onClose?: () => void;
}

const PAID_KEY_ROWS: Array<{
  id: Exclude<PaidProviderId, 'custom'>;
  label: string;
  placeholder: string;
  hint: string;
}> = [
  {
    id: 'gemini',
    label: 'Google Gemini (BYOK Optional)',
    placeholder: 'AIza...',
    hint: 'Server gateway already provides Gemini 3.5 Transcribe & 4 Hydrogen unless overridden'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    placeholder: 'sk-proj-...',
    hint: 'Enables GPT-4o & GPT-4o Transcribe'
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    placeholder: 'sk-ant-...',
    hint: 'Enables Claude Sonnet 4 for Email & Memo refinement'
  },
  {
    id: 'groq',
    label: 'Groq LPU',
    placeholder: 'gsk_...',
    hint: 'Enables 216x RT Whisper Large v3 Turbo & Llama 3.3 70B'
  },
  {
    id: 'deepgram',
    label: 'Deepgram',
    placeholder: 'Token...',
    hint: 'Enables Nova-3 realtime streaming & speaker diarization'
  },
  {
    id: 'assemblyai',
    label: 'AssemblyAI',
    placeholder: 'API Key...',
    hint: 'Enables Universal-2 enterprise streaming ASR'
  }
];

function downloadTextBlob(fileName: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const TierBars: React.FC<{ value: number; accentClass: string; label: string }> = ({
  value,
  accentClass,
  label
}) => (
  <div className="flex items-center gap-1.5" aria-label={`${label}: ${value} of 5`}>
    <span className="text-[10px] font-mono text-zinc-400 w-10 shrink-0">{label}</span>
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          className={`w-2.5 h-1.5 rounded-full transition-colors ${
            step <= value ? accentClass : 'bg-white/10'
          }`}
        />
      ))}
    </div>
  </div>
);

export const ModelAudioHubView: React.FC<ModelAudioHubViewProps> = ({
  settings,
  onUpdateSettings,
  historyEntries,
  onDeleteHistoryEntry,
  onWipeHistory,
  onInsertText,
  initialTab = 'models',
  mode = 'embedded',
  isOpen = true,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<HubTabId>(initialTab);
  const [modelSearch, setModelSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'stt' | 'llm' | 'translate'>('all');
  const [runtimeFilter, setRuntimeFilter] = useState<'all' | 'local' | 'cloud'>('all');
  const [realtimeOnly, setRealtimeOnly] = useState(false);

  const [cachedIds, setCachedIds] = useState<Set<string>>(() => getCachedModelIds());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadDetail, setDownloadDetail] = useState('');
  const downloadAbortRef = useRef<AbortController | null>(null);

  const [caps, setCaps] = useState<LocalSttCapabilities | null>(null);
  const [blockedCount, setBlockedCount] = useState(0);

  // Keys tab state
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [loopbackStatus, setLoopbackStatus] = useState<string | null>(null);
  const [keySavedToast, setKeySavedToast] = useState<string | null>(null);

  // Modes creator state
  const [showNewModeForm, setShowNewModeForm] = useState(false);
  const [newModeName, setNewModeName] = useState('');
  const [newModeTrigger, setNewModeTrigger] = useState('');
  const [newModeInstructions, setNewModeInstructions] = useState('');
  const [newModeAction, setNewModeAction] = useState<DictationOutputAction>('insert');

  // History state
  const [historySearch, setHistorySearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmWipeHistory, setConfirmWipeHistory] = useState(false);

  const localOnly = isLocalOnlyActive(settings);
  const modes = useMemo(
    () => loadDictationModes(settings.dictationModes),
    [settings.dictationModes]
  );
  const activeMode = useMemo(
    () => resolveActiveDictationMode(modes, settings.activeDictationModeId),
    [modes, settings.activeDictationModeId]
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    void detectLocalSttCapabilities().then(setCaps);
    const unsub = subscribeNetworkFirewall((ev) => setBlockedCount(ev.blockedCount));
    return unsub;
  }, []);

  const filteredModels = useMemo(
    () =>
      filterUnifiedModels({
        category: categoryFilter,
        runtime: runtimeFilter,
        realtimeOnly,
        search: modelSearch
      }),
    [categoryFilter, runtimeFilter, realtimeOnly, modelSearch]
  );

  const sttModels = useMemo(
    () => filteredModels.filter((m) => m.category === 'stt'),
    [filteredModels]
  );
  const textModels = useMemo(
    () => filteredModels.filter((m) => m.category === 'llm' || m.category === 'translate'),
    [filteredModels]
  );

  const activeStt =
    getUnifiedModelById(settings.activeSttModelId) ||
    UNIFIED_MODELS.find((m) => m.category === 'stt')!;
  const activeText =
    getUnifiedModelById(settings.activeTextModelId) ||
    UNIFIED_MODELS.find((m) => m.category === 'translate' || m.category === 'llm')!;

  const filteredHistory = useMemo(
    () => searchDictationHistory(historyEntries, historySearch),
    [historyEntries, historySearch]
  );

  const handleToggleLocalOnly = () => {
    triggerHaptic('medium');
    onUpdateSettings({ localOnly: !localOnly, offlineOnly: !localOnly });
  };

  const handleSelectModel = (model: UnifiedModelSpec) => {
    const avail = resolveModelAvailability(model, settings, cachedIds, downloadingId);
    if (!avail.selectable) {
      if (avail.status === 'missing-key') {
        triggerHaptic('warning');
        setActiveTab('keys');
      } else {
        triggerHaptic('warning');
      }
      return;
    }
    triggerHaptic('selection');
    if (model.category === 'stt') {
      onUpdateSettings({ activeSttModelId: model.id });
    } else {
      onUpdateSettings({ activeTextModelId: model.id });
    }
  };

  const handleDownloadWeights = async (model: UnifiedModelSpec) => {
    if (downloadingId) return;
    const ctrl = new AbortController();
    downloadAbortRef.current = ctrl;
    setDownloadingId(model.id);
    setDownloadProgress(8);
    setDownloadDetail(`Starting ${model.name}...`);
    triggerHaptic('light');

    try {
      await downloadLocalModelWeights(model.id, {
        localOnly,
        signal: ctrl.signal,
        onProgress: (pct, detail) => {
          setDownloadProgress(pct);
          setDownloadDetail(detail);
        }
      });
      setCachedIds(getCachedModelIds());
      triggerHaptic('success');
    } catch {
      // Cancelled or blocked
    } finally {
      setDownloadingId(null);
      setDownloadProgress(0);
      setDownloadDetail('');
      downloadAbortRef.current = null;
    }
  };

  const handleCancelDownload = () => {
    downloadAbortRef.current?.abort();
    setDownloadingId(null);
    setDownloadProgress(0);
    setDownloadDetail('');
  };

  const handleDeleteCachedWeights = (modelId: string) => {
    triggerHaptic('selection');
    setCachedIds(deleteCachedModelWeights(modelId));
    if (settings.activeSttModelId === modelId) {
      onUpdateSettings({ activeSttModelId: 'whisper-tiny-local' });
    }
  };

  const handleTestLoopback = async () => {
    const target = (settings.localServerUrl || 'http://127.0.0.1:11434').trim();
    if (!isLoopbackOrPrivateUrl(target)) {
      setLoopbackStatus('Blocked: Only localhost/127.0.0.1 or LAN IPs bypass Local-Only Shield.');
      return;
    }
    setLoopbackStatus(`Probing ${target}...`);
    try {
      const resp = await gatewayFetch(`${target.replace(/\/$/, '')}/api/tags`, {
        method: 'GET',
        localOnlyOverride: localOnly
      });
      if (resp.ok) {
        setLoopbackStatus(`Connected cleanly to loopback server (${target}).`);
      } else {
        setLoopbackStatus(`Reached ${target} (HTTP ${resp.status}).`);
      }
    } catch (err) {
      setLoopbackStatus(
        `No local listener running at ${target} (${err instanceof Error ? err.message : 'offline'}). WebGPU/WASM remains active.`
      );
    }
  };

  const handleCreateCustomMode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModeName.trim() || !newModeInstructions.trim()) return;
    const created: DictationMode = {
      id: `custom-${Date.now().toString(36)}`,
      name: newModeName.trim().slice(0, 32),
      icon: 'sparkles',
      description: newModeInstructions.trim().slice(0, 96),
      instructions: newModeInstructions.trim(),
      sttModelId: activeStt.id,
      textModelId: activeText.id,
      spokenTrigger: newModeTrigger.trim().toLowerCase(),
      stripTrigger: true,
      hotkey: 'Custom',
      outputAction: newModeAction,
      translateEnabled: Boolean(settings.translationEnabled),
      sourceLang: settings.translationSourceLang || 'Auto-detect',
      targetLang: settings.translationTargetLang || 'English (US)',
      builtIn: false
    };
    const nextModes = [...modes, created];
    saveCustomDictationModes(nextModes);
    onUpdateSettings({ dictationModes: nextModes, activeDictationModeId: created.id });
    setNewModeName('');
    setNewModeTrigger('');
    setNewModeInstructions('');
    setShowNewModeForm(false);
    triggerHaptic('success');
  };

  const handleDeleteCustomMode = (id: string) => {
    const nextModes = modes.filter((m) => m.id !== id);
    const safeModes = nextModes.length > 0 ? nextModes : DEFAULT_DICTATION_MODES;
    saveCustomDictationModes(safeModes);
    onUpdateSettings({
      dictationModes: safeModes,
      activeDictationModeId:
        settings.activeDictationModeId === id ? safeModes[0].id : settings.activeDictationModeId
    });
  };

  const handleCopyText = async (id: string, text: string) => {
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopiedId(id);
    triggerHaptic('selection');
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
  };

  const renderModelCard = (model: UnifiedModelSpec) => {
    const avail = resolveModelAvailability(model, settings, cachedIds, downloadingId);
    const isSelected =
      (model.category === 'stt' && settings.activeSttModelId === model.id) ||
      (model.category !== 'stt' && settings.activeTextModelId === model.id);
    const isDownloadingThis = downloadingId === model.id;

    return (
      <div
        key={model.id}
        data-testid={`hub-model-card-${model.id}`}
        className={`rounded-2xl p-3.5 transition-all border ${
          isSelected
            ? 'liquid-accent-glass border-[#0F7FFF]/70 ring-1 ring-[#0F7FFF]/40'
            : avail.selectable
              ? 'liquid-glass-subtle border-white/10 hover:border-white/20'
              : 'liquid-glass-subtle border-white/5 opacity-75'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="text-[13px] font-semibold text-white truncate">{model.name}</h4>
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase border ${
                  model.runtime === 'local'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-[#0F7FFF]/15 text-[#54B0FF] border-[#0F7FFF]/30'
                }`}
              >
                {model.isLoopbackServer ? 'Loopback' : model.runtime === 'local' ? 'Local' : 'Cloud'}
              </span>
              {model.capabilities.realtime && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/10 text-zinc-200 border border-white/10">
                  Realtime
                </span>
              )}
              {model.capabilities.translate && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-purple-500/15 text-purple-200 border border-purple-400/25">
                  A→B
                </span>
              )}
              {isSelected && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#0F7FFF] text-white">
                  Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{model.summary}</p>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[10px] font-mono text-zinc-300">{model.footprint.sizeLabel}</div>
            <div className="text-[9px] font-mono text-zinc-500 mt-0.5">
              {model.metrics.latencyHint}
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <TierBars
              value={model.metrics.speedTier}
              accentClass="bg-emerald-400"
              label="Speed"
            />
            <TierBars
              value={model.metrics.accuracyTier}
              accentClass="bg-[#54B0FF]"
              label="Accur"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isDownloadingThis ? (
              <div className="flex items-center gap-2">
                <div className="w-28">
                  <div className="text-[9px] font-mono text-[#54B0FF] truncate">
                    {downloadProgress}% · {downloadDetail}
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-0.5">
                    <div
                      className="h-full bg-[#0F7FFF] transition-all"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCancelDownload}
                  className="px-2 py-1 rounded-lg bg-rose-500/20 border border-rose-400/30 text-[10px] text-rose-200 hover:bg-rose-500/30"
                >
                  Cancel
                </button>
              </div>
            ) : avail.status === 'locked-local-only' ? (
              <span
                data-testid={`model-locked-badge-${model.id}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400/30 text-[10px] font-medium text-amber-200"
                title={avail.reason}
              >
                <Lock className="w-3 h-3" /> Blocked by Local-Only
              </span>
            ) : avail.status === 'missing-key' ? (
              <button
                type="button"
                onClick={() => setActiveTab('keys')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-[10px] font-medium text-zinc-200"
              >
                <KeyRound className="w-3 h-3 text-[#54B0FF]" /> Add {model.vendor} Key
              </button>
            ) : avail.status === 'not-downloaded' ? (
              <button
                type="button"
                disabled={localOnly}
                onClick={() => handleDownloadWeights(model)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F7FFF]/20 hover:bg-[#0F7FFF]/30 disabled:opacity-45 border border-[#0F7FFF]/40 text-[10px] font-semibold text-[#54B0FF]"
              >
                <Download className="w-3 h-3" />
                {localOnly ? 'Blocked (Local-Only)' : `Download (${model.footprint.sizeLabel})`}
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {model.runtime === 'local' && !model.defaultCached && !model.isLoopbackServer && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCachedWeights(model.id)}
                    title="Purge cached browser weights"
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-200 border border-white/10"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSelectModel(model)}
                  data-testid={`select-model-btn-${model.id}`}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    isSelected
                      ? 'bg-[#0F7FFF] text-white'
                      : 'bg-white/10 hover:bg-white/20 text-white border border-white/15'
                  }`}
                >
                  {isSelected ? <Check className="w-3 h-3" /> : null}
                  {isSelected
                    ? model.category === 'stt'
                      ? 'Selected STT'
                      : 'Selected Text'
                    : model.category === 'stt'
                      ? 'Use Speech'
                      : 'Use Text'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const innerContent = (
    <div className="space-y-4">
      {/* Unified Header + Persistent Local-Only Shield Toggle */}
      <div className="rounded-2xl liquid-glass p-4 border border-white/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[16px] font-semibold text-white">
                Models, Audio & Dictation Hub
              </h2>
              {caps && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/10 text-zinc-300 border border-white/10">
                  {caps.webgpu ? 'WebGPU + WASM' : 'WASM CPU'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Active Speech: <span className="text-zinc-200 font-medium">{activeStt.name}</span> ·
              Text/Translate: <span className="text-zinc-200 font-medium">{activeText.name}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="hub-local-only-toggle"
              onClick={handleToggleLocalOnly}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${
                localOnly
                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/45 shadow-[0_0_16px_rgba(16,185,129,0.2)]'
                  : 'bg-white/5 hover:bg-white/10 text-zinc-300 border-white/15'
              }`}
            >
              {localOnly ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-zinc-400" />
              )}
              <span>Local-Only Mode: {localOnly ? 'ON' : 'OFF'}</span>
              {localOnly && blockedCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-400/20 text-[9px] font-mono">
                  {blockedCount} blocked
                </span>
              )}
            </button>

            {mode === 'modal' && onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Hub"
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
          {(
            [
              { id: 'models', label: 'Models Catalog', icon: Cpu },
              { id: 'modes', label: 'Modes & A→B', icon: Languages },
              { id: 'keys', label: 'Keys & Loopback', icon: KeyRound },
              { id: 'history', label: `History (${historyEntries.length})`, icon: History }
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`hub-tab-${tab.id}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setActiveTab(tab.id);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-[#0F7FFF] text-white shadow-sm'
                    : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: MODELS CATALOG */}
      {activeTab === 'models' && (
        <div className="space-y-4">
          <div className="rounded-2xl liquid-glass-subtle p-3 border border-white/10 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="Filter Whisper, Parakeet, Gemini, Groq, Deepgram..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-[12px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#0F7FFF]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'stt', label: 'Speech (STT)' },
                  { id: 'llm', label: 'Cleanup / LLM' },
                  { id: 'translate', label: 'Translate A→B' }
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryFilter(c.id)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border ${
                    categoryFilter === c.id
                      ? 'bg-[#0F7FFF]/25 border-[#0F7FFF]/60 text-white'
                      : 'bg-white/5 border-white/10 text-zinc-300'
                  }`}
                >
                  {c.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() =>
                  setRuntimeFilter((r) => (r === 'all' ? 'local' : r === 'local' ? 'cloud' : 'all'))
                }
                className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-white/5 border border-white/10 text-zinc-200"
              >
                Runtime: {runtimeFilter.toUpperCase()}
              </button>

              <button
                type="button"
                onClick={() => setRealtimeOnly((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border ${
                  realtimeOnly
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                    : 'bg-white/5 border-white/10 text-zinc-300'
                }`}
              >
                Realtime Only
              </button>
            </div>
          </div>

          {localOnly && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-3.5 py-2.5 flex items-center justify-between gap-2 text-[11px] text-emerald-200">
              <span>
                Local-Only Shield active: Cloud models are locked below. Cached WebGPU/WASM &
                loopback servers remain available offline.
              </span>
              <button
                type="button"
                onClick={handleToggleLocalOnly}
                className="px-2 py-0.5 rounded bg-emerald-400/20 hover:bg-emerald-400/30 text-[10px] font-semibold shrink-0"
              >
                Unlock Cloud
              </button>
            </div>
          )}

          {sttModels.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-[#54B0FF]" /> Speech-to-Text Models ({sttModels.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {sttModels.map(renderModelCard)}
              </div>
            </div>
          )}

          {textModels.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-300" /> Cleanup & A→B Translation Models ({textModels.length})
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {textModels.map(renderModelCard)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MODES & A->B TRANSLATION */}
      {activeTab === 'modes' && (
        <div className="space-y-4">
          {/* Translation Pipeline Box */}
          <div className="rounded-2xl liquid-glass p-4 border border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-semibold text-white flex items-center gap-1.5">
                  <Languages className="w-4 h-4 text-[#54B0FF]" /> Speak Language A → Output Language B
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Real-time multilingual translation paired with cleanup instructions.
                </p>
              </div>
              <button
                type="button"
                data-testid="hub-translation-toggle"
                onClick={() =>
                  onUpdateSettings({ translationEnabled: !settings.translationEnabled })
                }
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border ${
                  settings.translationEnabled
                    ? 'bg-[#0F7FFF] border-[#0F7FFF] text-white'
                    : 'bg-white/5 border-white/15 text-zinc-300'
                }`}
              >
                {settings.translationEnabled ? 'Translation Enabled' : 'Translation Off'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
              <label className="block">
                <span className="text-[10px] font-mono text-zinc-400">Speak (Source A)</span>
                <select
                  value={settings.translationSourceLang || 'Auto-detect'}
                  onChange={(e) => onUpdateSettings({ translationSourceLang: e.target.value })}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-[12px] text-white"
                >
                  {SUPPORTED_DICTATION_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                aria-label="Swap Source and Target Languages"
                onClick={() => {
                  const src = settings.translationSourceLang || 'Auto-detect';
                  const dst = settings.translationTargetLang || 'Spanish';
                  if (src !== 'Auto-detect') {
                    onUpdateSettings({ translationSourceLang: dst, translationTargetLang: src });
                  }
                }}
                className="sm:mt-5 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 self-center justify-self-center"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>

              <label className="block">
                <span className="text-[10px] font-mono text-zinc-400">Output (Target B)</span>
                <select
                  value={settings.translationTargetLang || 'Spanish'}
                  onChange={(e) => onUpdateSettings({ translationTargetLang: e.target.value })}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-[12px] text-white"
                >
                  {SUPPORTED_DICTATION_LANGUAGES.filter((l) => l !== 'Auto-detect').map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-white/10">
              <label className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-[11px] text-zinc-200">
                <span>Auto-Punctuation</span>
                <input
                  type="checkbox"
                  checked={settings.autoPunctuation}
                  onChange={(e) => onUpdateSettings({ autoPunctuation: e.target.checked })}
                  className="accent-[#0F7FFF]"
                />
              </label>
              <label className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-[11px] text-zinc-200">
                <span>Speaker Diarization</span>
                <input
                  type="checkbox"
                  checked={settings.diarization}
                  onChange={(e) => onUpdateSettings({ diarization: e.target.checked })}
                  className="accent-[#0F7FFF]"
                />
              </label>
              <label className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2 text-[11px] text-zinc-200">
                <span>HUD Style</span>
                <select
                  value={settings.overlayStyle || 'capsule'}
                  onChange={(e) =>
                    onUpdateSettings({
                      overlayStyle: e.target.value as 'capsule' | 'panel'
                    })
                  }
                  className="bg-transparent text-right text-[#54B0FF] font-mono text-[11px] focus:outline-none"
                >
                  <option value="capsule">Capsule</option>
                  <option value="panel">Expanded Panel</option>
                </select>
              </label>
            </div>
          </div>

          {/* Dictation Modes */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              Dictation Modes & Spoken Triggers ({modes.length})
            </h3>
            <button
              type="button"
              onClick={() => setShowNewModeForm((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0F7FFF]/20 hover:bg-[#0F7FFF]/30 border border-[#0F7FFF]/40 text-[11px] text-[#54B0FF]"
            >
              <Plus className="w-3.5 h-3.5" /> New Custom Mode
            </button>
          </div>

          <MotionSheet
            isOpen={showNewModeForm}
            onClose={() => setShowNewModeForm(false)}
            ariaLabel="New Custom Dictation Mode"
            maxWidthClass="max-w-md"
          >
            <form onSubmit={handleCreateCustomMode} className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">New Custom Mode</h3>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Define formatting instructions &amp; optional spoken trigger
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewModeForm(false)}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                required
                value={newModeName}
                onChange={(e) => setNewModeName(e.target.value)}
                placeholder="Mode Name (e.g. Claims Legal Brief)"
                className="w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-[12px] text-white"
              />
              <input
                type="text"
                value={newModeTrigger}
                onChange={(e) => setNewModeTrigger(e.target.value)}
                placeholder="Spoken Trigger (e.g. legal note)"
                className="w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-[12px] text-white"
              />
              <textarea
                required
                rows={3}
                value={newModeInstructions}
                onChange={(e) => setNewModeInstructions(e.target.value)}
                placeholder="Instructions for formatting or transforming speech..."
                className="w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-[12px] text-white"
              />
              <select
                value={newModeAction}
                onChange={(e) => setNewModeAction(e.target.value as DictationOutputAction)}
                className="w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-[11px] text-white"
              >
                <option value="insert">Action: Insert into Active Note</option>
                <option value="copy">Action: Copy to Clipboard</option>
                <option value="history-only">Action: Archive to History Only</option>
              </select>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNewModeForm(false)}
                  className="px-3 py-2 rounded-xl bg-white/5 text-[11px] text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#0F7FFF] text-[11px] font-semibold text-white"
                >
                  Save Mode
                </button>
              </div>
            </form>
          </MotionSheet>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {modes.map((m) => {
              const selected = activeMode.id === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => {
                    triggerHaptic('selection');
                    onUpdateSettings({
                      activeDictationModeId: m.id,
                      ...(m.translateEnabled ? { translationEnabled: true } : {})
                    });
                  }}
                  className={`cursor-pointer rounded-2xl p-3.5 border transition-all ${
                    selected
                      ? 'liquid-accent-glass border-[#0F7FFF]/70'
                      : 'liquid-glass-subtle border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-white">{m.name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-mono text-zinc-300">
                          {m.hotkey}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-1">{m.description}</p>
                    </div>
                    {!m.builtIn && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCustomMode(m.id);
                        }}
                        className="p-1 rounded-lg text-zinc-400 hover:text-rose-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-zinc-300">
                    {m.spokenTrigger && (
                      <span className="px-1.5 py-0.5 rounded bg-black/30 border border-white/10">
                        Say “{m.spokenTrigger}”
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded bg-black/30 border border-white/10">
                      Output: {m.outputAction}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: KEYS & LOOPBACK ENDPOINTS */}
      {activeTab === 'keys' && (
        <div className="space-y-4">
          <div className="rounded-2xl liquid-glass p-4 border border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-semibold text-white flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-emerald-300" /> Localhost / Loopback Inference Server
                </h3>
                <p className="text-[11px] text-zinc-400">
                  Permitted even when Local-Only Mode is ON (targets 127.0.0.1 / localhost / LAN only).
                </p>
              </div>
              <button
                type="button"
                onClick={handleTestLoopback}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-[11px] font-medium text-emerald-200"
              >
                Ping Loopback
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label className="block">
                <span className="text-[10px] font-mono text-zinc-400">Loopback Base URL</span>
                <input
                  type="url"
                  value={settings.localServerUrl || 'http://127.0.0.1:11434'}
                  onChange={(e) => onUpdateSettings({ localServerUrl: e.target.value })}
                  placeholder="http://127.0.0.1:11434"
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-[12px] font-mono text-white"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-mono text-zinc-400">Custom Model ID</span>
                <input
                  type="text"
                  value={settings.customEndpoint.modelId}
                  onChange={(e) =>
                    onUpdateSettings({
                      customEndpoint: { ...settings.customEndpoint, modelId: e.target.value }
                    })
                  }
                  placeholder="llama3.2 / whisper-large-v3"
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/15 px-3 py-2 text-[12px] font-mono text-white"
                />
              </label>
            </div>

            {loopbackStatus && (
              <div className="text-[11px] font-mono text-emerald-200 bg-emerald-500/10 border border-emerald-400/20 rounded-xl px-3 py-2">
                {loopbackStatus}
              </div>
            )}
          </div>

          <div className="rounded-2xl liquid-glass p-4 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[13px] font-semibold text-white">Cloud Provider API Keys (BYOK)</h3>
                <p className="text-[11px] text-zinc-400">
                  Stored locally in your browser profile. Locked cleanly while Local-Only Mode is active.
                </p>
              </div>
              {keySavedToast && (
                <span className="text-[11px] font-mono text-emerald-300">{keySavedToast}</span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {PAID_KEY_ROWS.map((row) => {
                const value = settings.apiKeys[row.id] || '';
                const isRevealed = Boolean(visibleKeys[row.id]);
                return (
                  <div
                    key={row.id}
                    className="rounded-xl liquid-glass-subtle p-3 border border-white/10 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-white">{row.label}</span>
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                          value.trim().length >= 8
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-white/10 text-zinc-400'
                        }`}
                      >
                        {value.trim().length >= 8 ? 'Configured' : 'Empty'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type={isRevealed ? 'text' : 'password'}
                        value={value}
                        onChange={(e) => {
                          onUpdateSettings({
                            apiKeys: { ...settings.apiKeys, [row.id]: e.target.value }
                          });
                          setKeySavedToast(`Saved ${row.label}`);
                          setTimeout(() => setKeySavedToast(null), 1200);
                        }}
                        placeholder={row.placeholder}
                        className="flex-1 rounded-lg bg-black/40 border border-white/15 px-2.5 py-1.5 text-[11px] font-mono text-white"
                      />
                      <button
                        type="button"
                        aria-label={isRevealed ? `Hide ${row.label} key` : `Show ${row.label} key`}
                        onClick={() =>
                          setVisibleKeys((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                        }
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300"
                      >
                        {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-500">{row.hint}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DICTATION HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          <div className="rounded-2xl liquid-glass-subtle p-3 border border-white/10 flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search transcripts & translations..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-[12px] text-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={settings.historyRetention || 'forever'}
                onChange={(e) =>
                  onUpdateSettings({
                    historyRetention: e.target.value as DictationHistoryRetention
                  })
                }
                aria-label="History Retention Policy"
                className="rounded-xl bg-black/40 border border-white/15 px-2.5 py-1.5 text-[11px] text-zinc-200"
              >
                <option value="forever">Retention: Keep Forever</option>
                <option value="30d">Retention: 30 Days</option>
                <option value="none">Retention: Disabled</option>
              </select>

              {historyEntries.length > 0 &&
                (confirmWipeHistory ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        onWipeHistory();
                        setConfirmWipeHistory(false);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-semibold"
                    >
                      Confirm Wipe
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmWipeHistory(false)}
                      className="px-2 py-1 rounded-lg bg-white/10 text-zinc-300 text-[10px]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmWipeHistory(true)}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-[11px] text-rose-200"
                  >
                    Wipe All
                  </button>
                ))}
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="rounded-2xl liquid-glass-subtle p-8 text-center border border-white/10">
              <History className="w-7 h-7 text-zinc-500 mx-auto mb-2" />
              <div className="text-[13px] font-medium text-zinc-200">
                No dictation sessions archived yet
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Start a real-time transcription session inside Meetings → Live Studio to archive turns here.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredHistory.map((entry) => {
                const primaryOutput = entry.translatedText || entry.finalText;
                return (
                  <div
                    key={entry.id}
                    data-testid={`history-entry-${entry.id}`}
                    className="rounded-2xl liquid-glass-subtle p-3.5 border border-white/10 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                        <span className="px-2 py-0.5 rounded bg-[#0F7FFF]/20 text-[#54B0FF] border border-[#0F7FFF]/30">
                          {entry.modeName}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-white/10 text-zinc-300">
                          {entry.sttModelName}
                        </span>
                        {entry.localOnlyUsed && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-400/25">
                            Local-Only
                          </span>
                        )}
                        <span className="text-zinc-500">
                          {new Date(entry.createdIso).toLocaleString()} · {entry.wordCount} words
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteHistoryEntry(entry.id)}
                        aria-label="Delete history item"
                        className="p-1 rounded-lg text-zinc-400 hover:text-rose-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <p className="text-[12px] text-white leading-relaxed whitespace-pre-wrap">
                      {primaryOutput}
                    </p>

                    {entry.translatedText && entry.finalText !== entry.translatedText && (
                      <div className="rounded-xl bg-black/30 border border-white/10 p-2.5 text-[11px] text-zinc-400">
                        <span className="font-mono text-zinc-300 mr-1.5">
                          Source ({entry.sourceLang}):
                        </span>
                        {entry.finalText}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {onInsertText && (
                        <button
                          type="button"
                          onClick={() => onInsertText(primaryOutput)}
                          className="px-2.5 py-1 rounded-lg bg-[#0F7FFF] hover:bg-[#238CFF] text-white text-[10px] font-semibold"
                        >
                          Insert into Note
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyText(entry.id, primaryOutput)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-200 text-[10px]"
                      >
                        {copiedId === entry.id ? (
                          <Check className="w-3 h-3 text-emerald-300" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        {copiedId === entry.id ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextBlob(
                            `dictation-${entry.id}.md`,
                            formatHistoryEntryAsMarkdown(entry),
                            'text/markdown'
                          )
                        }
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px] font-mono"
                      >
                        <FileDown className="w-3 h-3" /> .md
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextBlob(
                            `dictation-${entry.id}.txt`,
                            formatHistoryEntryAsTxt(entry),
                            'text/plain'
                          )
                        }
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px] font-mono"
                      >
                        .txt
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextBlob(
                            `dictation-${entry.id}.srt`,
                            formatHistoryEntryAsSrt(entry),
                            'application/x-subrip'
                          )
                        }
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px] font-mono"
                      >
                        .srt
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextBlob(
                            `dictation-${entry.id}.vtt`,
                            formatHistoryEntryAsVtt(entry),
                            'text/vtt'
                          )
                        }
                        className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-[10px] font-mono"
                      >
                        .vtt
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (mode === 'modal') {
    return (
      <MotionSheet
        isOpen={isOpen}
        onClose={onClose || (() => undefined)}
        ariaLabel="Models, Audio & Dictation Hub"
        maxWidthClass="max-w-4xl"
      >
        <div className="p-4 sm:p-5 overflow-y-auto">{innerContent}</div>
      </MotionSheet>
    );
  }

  return innerContent;
};
