import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  Database,
  MessageSquare,
  Send,
  Sparkles
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type {
  CoreDataVectorStoreState,
  MeetingSession,
  ModelOption,
  RagStrategyId,
  RagSynthesisResult
} from '../types/index.ts';
import { upsertCoreDataDocument } from '../utils/coreDataVectorDb.ts';
import { RAG_STRATEGIES } from '../utils/ragEngine.ts';
import { executeFullRagPipeline } from '../utils/ragClient.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS } from '../utils/motion.ts';

interface StudioRagAskStageProps {
  session: MeetingSession;
  coreDataStore: CoreDataVectorStoreState;
  localModel: Pick<ModelOption, 'name' | 'engine' | 'tokensPerSec'>;
  offlineOnly: boolean;
}

interface RagConversationTurn {
  id: string;
  question: string;
  synthesis: RagSynthesisResult;
}

export const StudioRagAskStage: React.FC<StudioRagAskStageProps> = ({
  session,
  coreDataStore,
  localModel,
  offlineOnly
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [strategyId, setStrategyId] = useState<RagStrategyId>('hybrid-rrf');
  const [queryInput, setQueryInput] = useState('');
  const [scopeToMeeting, setScopeToMeeting] = useState(true);
  const [turns, setTurns] = useState<RagConversationTurn[]>([]);
  const [expandedTurnId, setExpandedTurnId] = useState<string | null>(null);

  // Merge selected meeting session directly into an augmented in-memory CoreData store
  const sessionDocId = `meeting-rag-${session.id}`;
  const augmentedStore = useMemo(() => {
    const meetingBody = [
      `Meeting Title: ${session.title} (Session S${session.sessionNumber})`,
      `Summary: ${session.summary}`,
      session.items
        .map(
          (i) =>
            `${i.category.toUpperCase()}${i.owner ? ` [${i.owner}]` : ''}: ${i.text}`
        )
        .join('\n'),
      session.highlights.map((h) => `[${h.timestamp}] ${h.speaker}: ${h.text}`).join('\n')
    ]
      .filter(Boolean)
      .join('\n\n');

    return upsertCoreDataDocument(coreDataStore, {
      id: sessionDocId,
      title: `S${session.sessionNumber}: ${session.title}`,
      format: 'Note',
      assetKind: 'document',
      sizeKB: Math.max(2, Math.round(meetingBody.length / 1024)),
      summary: session.summary,
      text: meetingBody,
      tags: ['Meeting', `S${session.sessionNumber}`]
    }).nextStore;
  }, [coreDataStore, session, sessionDocId]);

  const handleAsk = async (rawPrompt?: string) => {
    const prompt = (rawPrompt ?? queryInput).trim();
    if (!prompt) return;
    triggerHaptic('medium');

    const synthesis = await executeFullRagPipeline({
      store: augmentedStore,
      query: prompt,
      strategyId,
      topK: 4,
      filterDocumentId: scopeToMeeting ? sessionDocId : null,
      localModel,
      offlineOnly
    });

    const newTurn: RagConversationTurn = {
      id: `rag-turn-${Date.now()}`,
      question: prompt,
      synthesis
    };
    setTurns((prev) => [newTurn, ...prev]);
    setExpandedTurnId(newTurn.id);
    if (!rawPrompt) setQueryInput('');
    triggerHaptic('success');
  };

  const quickPrompts = [
    `Summarize key decisions and owners from ${session.title}`,
    'What risks or blockers still need mitigation?',
    'How does this meeting connect with Workspace Sources?'
  ];

  return (
    <div className="space-y-3">
      {/* Header & Strategy Selector */}
      <div className="p-4 rounded-2xl liquid-glass space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#2B98FF] shrink-0" />
              <h3 className="text-xs font-semibold text-zinc-100">RAG Search &amp; Ask AI</h3>
            </div>
            <p className="text-[11px] font-mono text-zinc-400 mt-0.5 truncate">
              {augmentedStore.documents.length} indexed docs · {augmentedStore.chunks.length} chunks
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setScopeToMeeting((prev) => !prev);
              }}
              className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                scopeToMeeting
                  ? 'liquid-lens-active text-zinc-950 font-semibold border-white/50'
                  : 'liquid-glass-subtle text-zinc-300 border-white/10 hover:text-white'
              }`}
            >
              {scopeToMeeting
                ? `This Meeting (S${session.sessionNumber})`
                : 'Meeting + Workspace Sources'}
            </button>

            <select
              aria-label="RAG retrieval strategy"
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value as RagStrategyId)}
              className="liquid-glass-subtle rounded-full px-3 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-white/30"
            >
              {RAG_STRATEGIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shortLabel}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Question Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAsk();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            aria-label="Ask AI about this meeting and sources"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={`Ask about Session S${session.sessionNumber} or Workspace Sources…`}
            className="flex-1 min-w-0 min-h-[42px] liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#54B0FF]"
          />
          <motion.button
            type="submit"
            disabled={!queryInput.trim()}
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            className="min-h-[42px] px-4 py-2 rounded-xl liquid-accent-glass text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Ask AI</span>
          </motion.button>
        </form>

        {/* Suggested Prompts */}
        <div className="flex flex-wrap items-center gap-1.5">
          {quickPrompts.map((qp) => (
            <button
              key={qp}
              type="button"
              onClick={() => void handleAsk(qp)}
              className="px-2.5 py-1 rounded-full liquid-glass-subtle hover:bg-white/10 text-[10.5px] text-zinc-300 hover:text-white transition-colors flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3 text-[#54B0FF]" />
              <span className="truncate max-w-[260px]">{qp}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Responses */}
      {turns.length === 0 ? (
        <div className="p-6 rounded-2xl liquid-glass text-center space-y-1.5">
          <Database className="w-5 h-5 text-[#54B0FF] mx-auto" />
          <div className="text-xs font-medium text-zinc-200">
            Grounded Retrieval Ready
          </div>
          <p className="text-[11px] text-zinc-400 max-w-md mx-auto">
            Ask a question above to search Session S{session.sessionNumber} highlights and your Workspace Sources with citations.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {turns.map((turn) => {
            const expanded = expandedTurnId === turn.id;
            return (
              <div key={turn.id} className="p-4 rounded-2xl liquid-glass space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-zinc-100">{turn.question}</div>
                  <span className="text-[10px] font-mono text-emerald-300 shrink-0">
                    {turn.synthesis.confidenceScore}% conf · {turn.synthesis.strategyLabel}
                  </span>
                </div>

                <div className="text-xs text-zinc-200 leading-relaxed whitespace-pre-line">
                  {turn.synthesis.answer}
                </div>

                <div className="pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setExpandedTurnId(expanded ? null : turn.id)}
                    className="flex items-center gap-1.5 text-[11px] font-mono text-[#54B0FF] hover:text-sky-300"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                    <span>
                      {turn.synthesis.retrievedChunks.length} retrieved chunks &amp; pipeline steps
                    </span>
                  </button>

                  {expanded && (
                    <div className="mt-2 space-y-2 text-[11px]">
                      <div className="space-y-1 font-mono text-zinc-400">
                        {turn.synthesis.pipelineSteps.map((step, i) => (
                          <div key={i}>{step}</div>
                        ))}
                      </div>
                      <div className="space-y-1.5">
                        {turn.synthesis.retrievedChunks.map((chunk) => (
                          <div
                            key={chunk.chunkId}
                            className="p-2.5 rounded-xl liquid-glass-subtle border border-white/10 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-zinc-400">
                              <span className="text-zinc-200 truncate">
                                {chunk.documentTitle} · {chunk.sectionLabel}
                              </span>
                              <span>score {chunk.fusedScore}</span>
                            </div>
                            <p className="text-zinc-300 leading-snug">{chunk.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
