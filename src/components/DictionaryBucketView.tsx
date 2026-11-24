import React, { useMemo, useState } from 'react';
import {
  BookA,
  Sparkles,
  Search,
  Plus,
  Trash2,
  AlertCircle,
  Key,
  X
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AppSettings,
  CloudAgentProviderId,
  DictionaryEntry,
  DictionaryTermSource,
  PaidProviderId
} from '../types/index.ts';
import {
  buildCustomDictionaryWithAgents,
  categorizeTerm,
  formatDictionaryTermsCsv
} from '../utils/dictionaryLearning.ts';
import { checkCloudAgentReadiness } from '../utils/providerRouting.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS, buildListItemVariants } from '../utils/motion.ts';
import {
  AnimatedCheckmark,
  MotionAlertBanner,
  MotionSheet,
  SkeletonStreamLoader
} from './MotionPrimitives.tsx';

interface DictionaryBucketViewProps {
  entries: DictionaryEntry[];
  settings: AppSettings;
  onUpdateEntries: (next: DictionaryEntry[]) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onOpenApiKeys: (focusProvider?: PaidProviderId) => void;
}

type SourceFilter = 'all' | DictionaryTermSource;

const SOURCE_FILTER_LABELS: Array<{ id: SourceFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'audio-meeting', label: 'Audio' },
  { id: 'transcript-pdf', label: 'PDF' },
  { id: 'live-stream', label: 'Live' },
  { id: 'cloud-agent', label: 'Agent' },
  { id: 'manual', label: 'Manual' }
];

const SOURCE_LABEL_TEXT: Record<DictionaryTermSource, string> = {
  seed: 'Seed',
  'audio-meeting': 'Audio Meeting',
  'transcript-pdf': 'Transcript PDF',
  'live-stream': 'Live Stream',
  'cloud-agent': 'Cloud AI Agent',
  manual: 'Manual'
};

export const DictionaryBucketView: React.FC<DictionaryBucketViewProps> = ({
  entries,
  settings,
  onUpdateEntries,
  onUpdateSettings,
  onOpenApiKeys
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const listItemVariants = buildListItemVariants(prefersReduced);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [newTermText, setNewTermText] = useState('');
  const [showAddTermSheet, setShowAddTermSheet] = useState(false);
  const [showEnrichSheet, setShowEnrichSheet] = useState(false);
  const [agentProvider, setAgentProvider] = useState<CloudAgentProviderId>('openai');
  const [agentStatus, setAgentStatus] = useState<'idle' | 'running' | 'completed'>('idle');
  const [activeStageIdx, setActiveStageIdx] = useState<number>(-1);
  const [lastAgentStages, setLastAgentStages] = useState<Array<{ stage: string; detail: string }>>([]);

  const agentReadiness = useMemo(
    () => checkCloudAgentReadiness(agentProvider, settings),
    [agentProvider, settings]
  );

  const stats = useMemo(() => {
    const learnedFromDocs = entries.filter(
      e => e.source === 'audio-meeting' || e.source === 'transcript-pdf' || e.source === 'live-stream'
    ).length;
    const verifiedCount = entries.filter(e => e.verifiedByAgent).length;
    return { total: entries.length, learnedFromDocs, verifiedCount };
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter(entry => {
      if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        entry.term.toLowerCase().includes(q) ||
        entry.category.toLowerCase().includes(q) ||
        entry.sourceFile.toLowerCase().includes(q) ||
        (entry.definition || '').toLowerCase().includes(q) ||
        (entry.aliases || []).some(a => a.toLowerCase().includes(q))
      );
    });
  }, [entries, sourceFilter, searchQuery]);

  const handleAddManualTerm = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTermText.trim();
    if (!trimmed) return;
    if (entries.some(item => item.term.toLowerCase() === trimmed.toLowerCase())) {
      setNewTermText('');
      return;
    }

    const newEntry: DictionaryEntry = {
      id: `dict-manual-${Date.now()}`,
      term: trimmed,
      category: categorizeTerm(trimmed),
      source: 'manual',
      sourceFile: 'Manual Entry',
      occurrences: 1,
      boostWeight: 3.5,
      verifiedByAgent: false,
      learnedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    const next = [newEntry, ...entries];
    onUpdateEntries(next);
    onUpdateSettings({ domainTerms: formatDictionaryTermsCsv(next) });
    setNewTermText('');
    setShowAddTermSheet(false);
    triggerHaptic('success');
  };

  const handleDeleteEntry = (id: string) => {
    const next = entries.filter(e => e.id !== id);
    onUpdateEntries(next);
    onUpdateSettings({ domainTerms: formatDictionaryTermsCsv(next) });
    triggerHaptic('warning');
  };

  const handleBuildWithCloudAgents = () => {
    if (!agentReadiness.ready || agentStatus === 'running') return;
    setAgentStatus('running');
    setActiveStageIdx(0);

    setTimeout(() => setActiveStageIdx(1), 220);
    setTimeout(() => setActiveStageIdx(2), 440);
    setTimeout(() => {
      const result = buildCustomDictionaryWithAgents(entries, agentProvider, settings);
      if (result.ok) {
        onUpdateEntries(result.entries);
        onUpdateSettings({ domainTerms: result.domainTermsCsv });
        setLastAgentStages(result.stages);
        setAgentStatus('completed');
        triggerHaptic('success');
      } else {
        setAgentStatus('idle');
        triggerHaptic('warning');
      }
      setActiveStageIdx(-1);
    }, 680);
  };

  const AGENT_STAGE_NAMES = [
    '1. Corpus Miner Agent · Scanning meeting audio & transcript PDFs',
    '2. Taxonomy & Phonetic Agent · Calibrating ASR boost weights & aliases',
    '3. Cross-Session Verifier Agent · Deduplicating & verifying ClaimCenter terms'
  ];

  return (
    <div className="space-y-3">
      {/* Compact Dictionary Header Controls */}
      <div className="rounded-2xl liquid-glass divide-y divide-white/10 text-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookA className="w-4 h-4 text-[#2B98FF] shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-100">
                Auto-Learn Vocabulary
              </div>
              <div className="text-[11px] text-zinc-400 font-mono tabular-nums mt-0.5">
                {stats.total} terms · {stats.learnedFromDocs} learned · {stats.verifiedCount} verified
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowEnrichSheet(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-200"
            >
              <Sparkles className="w-3 h-3 text-[#54B0FF]" />
              <span>Cloud Enrich</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddTermSheet(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full liquid-accent-glass text-[11px] font-semibold"
            >
              <Plus className="w-3 h-3" />
              <span>Add Term</span>
            </button>
            <motion.button
              type="button"
              role="switch"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              aria-checked={settings.autoLearnDictionary}
              aria-label="Toggle auto-learn dictionary from meetings and PDFs"
              onClick={() => onUpdateSettings({ autoLearnDictionary: !settings.autoLearnDictionary })}
              className={`px-2.5 py-1 rounded-full text-[11px] font-mono transition-colors ${
                settings.autoLearnDictionary
                  ? 'liquid-lens-active font-semibold'
                  : 'liquid-glass-subtle text-zinc-400'
              }`}
            >
              {settings.autoLearnDictionary ? 'ON' : 'OFF'}
            </motion.button>
          </div>
        </div>

        {/* Search & Origin Filter Bar */}
        <div className="px-4 py-3 space-y-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search custom dictionary terms"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search learned terms, aliases, or PDF sources..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl liquid-glass-subtle text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#0F7FFF]"
            />
          </div>

          <div
            role="group"
            aria-label="Filter dictionary terms by origin"
            className="flex flex-wrap items-center gap-0.5 p-1 rounded-full liquid-glass-subtle text-[11px] w-fit"
          >
            {SOURCE_FILTER_LABELS.map(item => {
              const active = sourceFilter === item.id;
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => setSourceFilter(item.id)}
                  className={`relative px-2.5 py-1 rounded-full font-medium transition-colors ${
                    active
                      ? 'text-zinc-950'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="dictionary-filter-pill"
                      transition={MOTION_SPRINGS.pill}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full liquid-lens-active"
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dictionary Terms Catalog */}
      <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-5 text-center text-xs text-zinc-400">
            No matching dictionary terms.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredEntries.map((entry, idx) => (
              <motion.div
                key={entry.id}
                layout="position"
                custom={idx}
                variants={listItemVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="px-3.5 py-2.5 flex items-start justify-between gap-2"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-100">{entry.term}</span>
                    <span className="text-[10px] font-mono text-zinc-400">{entry.category}</span>
                    <span className="text-[10px] font-mono tabular-nums text-zinc-400">
                      {entry.boostWeight.toFixed(1)}x boost · {entry.occurrences}×
                    </span>
                    {entry.verifiedByAgent && (
                      <span className="text-[10px] font-mono text-emerald-400">
                        ✓ Agent Verified
                      </span>
                    )}
                  </div>

                  {entry.definition && (
                    <p className="text-[11px] text-zinc-300 leading-snug">{entry.definition}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                    <span>{SOURCE_LABEL_TEXT[entry.source]}</span>
                    <span>·</span>
                    <span className="truncate max-w-[240px]">{entry.sourceFile}</span>
                    {entry.aliases && entry.aliases.length > 0 && (
                      <>
                        <span>·</span>
                        <span>Aliases: {entry.aliases.join(', ')}</span>
                      </>
                    )}
                  </div>
                </div>

                <motion.button
                  type="button"
                  data-haptic="off"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => handleDeleteEntry(entry.id)}
                  aria-label={`Remove ${entry.term} from dictionary`}
                  className="p-1.5 rounded-full text-zinc-400 hover:text-red-400 hover:bg-white/10 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </motion.button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Active ASR Prompt Bias String */}
      <div className="rounded-2xl liquid-glass px-4 py-3 space-y-1.5">
        <label htmlFor="domain-terms" className="text-xs font-medium text-zinc-100 block">
          ASR Keyterm Bias Prompt
        </label>
        <input
          id="domain-terms"
          type="text"
          value={settings.domainTerms}
          onChange={(e) => onUpdateSettings({ domainTerms: e.target.value })}
          className="w-full liquid-glass-subtle rounded-xl px-3 py-2 text-[11px] font-mono text-zinc-200 focus:outline-hidden focus:border-[#0F7FFF]"
        />
      </div>

      {/* Add Manual Term MotionSheet */}
      <MotionSheet
        isOpen={showAddTermSheet}
        onClose={() => setShowAddTermSheet(false)}
        ariaLabel="Add Dictionary Term"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleAddManualTerm} className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Add Custom Term</h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Boosts speech recognition &amp; meeting summary accuracy
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddTermSheet(false)}
              className="p-1.5 rounded-xl liquid-glass-subtle text-zinc-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <input
            type="text"
            aria-label="Add custom dictionary term"
            value={newTermText}
            onChange={(e) => setNewTermText(e.target.value)}
            placeholder="e.g. CoverageSubtype, LossLocation..."
            className="w-full liquid-glass-subtle rounded-xl px-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#0F7FFF]"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddTermSheet(false)}
              className="px-3 py-2 rounded-xl liquid-glass-subtle text-xs text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newTermText.trim()}
              className="px-4 py-2 rounded-xl liquid-accent-glass text-xs font-semibold disabled:opacity-40"
            >
              Add Term
            </button>
          </div>
        </form>
      </MotionSheet>

      {/* Cloud AI Enrichment MotionSheet */}
      <MotionSheet
        isOpen={showEnrichSheet}
        onClose={() => setShowEnrichSheet(false)}
        ariaLabel="Cloud AI Agent Dictionary Builder"
        maxWidthClass="max-w-md"
      >
        <div className="p-5 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Cloud AI Agent Enrichment</h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Enriches definitions, aliases &amp; ASR boost weights
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowEnrichSheet(false)}
              className="p-1.5 rounded-xl liquid-glass-subtle text-zinc-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <select
            aria-label="Cloud AI Agent provider for custom dictionary"
            value={agentProvider}
            onChange={(e) => {
              setAgentProvider(e.target.value as CloudAgentProviderId);
              setAgentStatus('idle');
            }}
            className="w-full liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100"
          >
            <option value="openai">OpenAI Agent (GPT-4o)</option>
            <option value="anthropic">Anthropic Agent (Claude Sonnet 4)</option>
            <option value="gemini">Google Gemini Agent</option>
          </select>

          {!agentReadiness.ready && (
            <MotionAlertBanner
              shakeKey={`${agentProvider}-${agentReadiness.reason || 'gate'}`}
              className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/35 text-[11px]"
            >
              <div className="flex items-center gap-1.5 text-amber-300">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{agentReadiness.reason}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {settings.offlineOnly ? (
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ offlineOnly: false, localOnly: false })}
                    className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-medium"
                  >
                    Disable Offline
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowEnrichSheet(false);
                      onOpenApiKeys(agentProvider);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-medium"
                  >
                    <Key className="w-3 h-3" />
                    <span>Add {agentReadiness.providerName} Key</span>
                  </button>
                )}
              </div>
            </MotionAlertBanner>
          )}

          <AnimatePresence mode="wait">
            {agentStatus === 'running' && (
              <div key="agent-running" className="space-y-2">
                <SkeletonStreamLoader
                  label={AGENT_STAGE_NAMES[Math.max(0, activeStageIdx)]}
                  lines={2}
                />
              </div>
            )}

            {agentStatus === 'completed' && lastAgentStages.length > 0 && (
              <motion.div
                key="agent-completed"
                initial={{ opacity: 0, y: prefersReduced ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-1.5 p-3 rounded-xl liquid-glass-subtle border border-emerald-500/30 text-[11px]"
              >
                {lastAgentStages.map((s) => (
                  <div key={s.stage} className="flex items-start gap-2 text-zinc-300">
                    <AnimatedCheckmark className="w-3.5 h-3.5 text-emerald-400 mt-0.5" />
                    <div>
                      <span className="font-mono text-zinc-200">{s.stage}: </span>
                      <span className="text-zinc-400">{s.detail}</span>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowEnrichSheet(false)}
              className="px-3 py-2 rounded-xl liquid-glass-subtle text-xs text-zinc-300"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleBuildWithCloudAgents}
              disabled={!agentReadiness.ready || agentStatus === 'running'}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl liquid-accent-glass text-xs font-semibold disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{agentStatus === 'running' ? 'Running Agents...' : 'Run Enrichment'}</span>
            </button>
          </div>
        </div>
      </MotionSheet>
    </div>
  );
};
