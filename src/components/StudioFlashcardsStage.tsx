import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  RotateCcw,
  Shuffle,
  Sparkles
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type {
  DictionaryEntry,
  MeetingSession,
  StudioFlashcard,
  StudioFlashcardCategory
} from '../types/index.ts';
import { generateFlashcardsFromSession } from '../utils/studioFlashcards.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS } from '../utils/motion.ts';

interface StudioFlashcardsStageProps {
  session: MeetingSession;
  dictionaryEntries: DictionaryEntry[];
  cloudReady: boolean;
  providerLabel: string;
}

const FILTER_CATEGORIES: Array<'All' | StudioFlashcardCategory> = [
  'All',
  'Decision',
  'Action',
  'Risk',
  'Key Term',
  'Highlight'
];

export const StudioFlashcardsStage: React.FC<StudioFlashcardsStageProps> = ({
  session,
  dictionaryEntries,
  cloudReady,
  providerLabel
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [cards, setCards] = useState<StudioFlashcard[]>(() =>
    generateFlashcardsFromSession(session, dictionaryEntries)
  );
  const [categoryFilter, setCategoryFilter] = useState<'All' | StudioFlashcardCategory>('All');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredIds, setMasteredIds] = useState<Set<string>>(new Set());
  const [reviewAgainIds, setReviewAgainIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCards(generateFlashcardsFromSession(session, dictionaryEntries));
    setCategoryFilter('All');
    setActiveIndex(0);
    setIsFlipped(false);
    setMasteredIds(new Set());
    setReviewAgainIds(new Set());
  }, [session.id]);

  const visibleCards = useMemo(() => {
    if (categoryFilter === 'All') return cards;
    return cards.filter((c) => c.deckCategory === categoryFilter);
  }, [cards, categoryFilter]);

  const currentCard = visibleCards[Math.min(activeIndex, Math.max(0, visibleCards.length - 1))];

  useEffect(() => {
    setActiveIndex(0);
    setIsFlipped(false);
  }, [categoryFilter]);

  const handleRegenerate = () => {
    triggerHaptic('medium');
    setCards(generateFlashcardsFromSession(session, dictionaryEntries));
    setActiveIndex(0);
    setIsFlipped(false);
    setMasteredIds(new Set());
    setReviewAgainIds(new Set());
  };

  const handleShuffle = () => {
    triggerHaptic('selection');
    setCards((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
    setActiveIndex(0);
    setIsFlipped(false);
  };

  const advanceCard = (delta: number) => {
    if (visibleCards.length === 0) return;
    triggerHaptic('selection');
    setIsFlipped(false);
    setActiveIndex((prev) => (prev + delta + visibleCards.length) % visibleCards.length);
  };

  const handleMarkStatus = (status: 'mastered' | 'review') => {
    if (!currentCard) return;
    triggerHaptic(status === 'mastered' ? 'success' : 'selection');
    if (status === 'mastered') {
      setMasteredIds((prev) => new Set(prev).add(currentCard.id));
      setReviewAgainIds((prev) => {
        const next = new Set(prev);
        next.delete(currentCard.id);
        return next;
      });
    } else {
      setReviewAgainIds((prev) => new Set(prev).add(currentCard.id));
      setMasteredIds((prev) => {
        const next = new Set(prev);
        next.delete(currentCard.id);
        return next;
      });
    }
    if (visibleCards.length > 1) {
      setTimeout(() => advanceCard(1), 160);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header Controls */}
      <div className="p-4 rounded-2xl liquid-glass flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#2B98FF] shrink-0" />
            <h3 className="text-xs font-semibold text-zinc-100">Meeting Flashcards</h3>
          </div>
          <p className="text-[11px] font-mono text-zinc-400 mt-0.5 truncate">
            {cards.length} cards · Mastered {masteredIds.size} · Review {reviewAgainIds.size}
            {cloudReady ? ` · ${providerLabel}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <motion.button
            type="button"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={handleShuffle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-100 whitespace-nowrap"
          >
            <Shuffle className="w-3.5 h-3.5 text-[#54B0FF]" />
            <span>Shuffle</span>
          </motion.button>
          <motion.button
            type="button"
            data-haptic="medium"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={handleRegenerate}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full liquid-accent-glass text-xs font-semibold whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Rebuild Deck</span>
          </motion.button>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-full liquid-glass-subtle w-fit">
        {FILTER_CATEGORIES.map((cat) => {
          const active = categoryFilter === cat;
          const count =
            cat === 'All' ? cards.length : cards.filter((c) => c.deckCategory === cat).length;
          if (cat !== 'All' && count === 0) return null;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setCategoryFilter(cat);
              }}
              className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'liquid-lens-active text-zinc-950 font-semibold'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Flashcard Interactive Stage */}
      {currentCard ? (
        <div className="space-y-3">
          <motion.button
            type="button"
            data-haptic="selection"
            onClick={() => {
              triggerHaptic('selection');
              setIsFlipped((prev) => !prev);
            }}
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
            transition={MOTION_SPRINGS.interactive}
            aria-label={isFlipped ? 'Show flashcard question' : 'Flip flashcard to reveal answer'}
            className="w-full min-h-[220px] rounded-[24px] liquid-glass-elevated p-6 text-left flex flex-col justify-between gap-4 border border-white/15 hover:border-[#54B0FF]/45 transition-colors"
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="px-2.5 py-0.5 rounded-full liquid-glass-subtle text-[10.5px] font-mono text-[#54B0FF]">
                {currentCard.deckCategory} · {isFlipped ? 'Answer' : 'Prompt'}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-zinc-400">
                {activeIndex + 1} / {visibleCards.length}
              </span>
            </div>

            <div className="my-auto py-2">
              {isFlipped ? (
                <p className="text-sm sm:text-base text-zinc-100 leading-relaxed">
                  {currentCard.back}
                </p>
              ) : (
                <h4 className="text-base sm:text-lg font-semibold text-zinc-50 leading-snug">
                  {currentCard.front}
                </h4>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/10 text-[10.5px] font-mono text-zinc-400 w-full">
              <span className="truncate">{currentCard.sourceRef}</span>
              <span className="text-[#54B0FF] shrink-0">Tap card to flip</span>
            </div>
          </motion.button>

          {/* Bottom Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => advanceCard(-1)}
                aria-label="Previous flashcard"
                className="min-h-[40px] px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-200 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev</span>
              </button>
              <button
                type="button"
                onClick={() => advanceCard(1)}
                aria-label="Next flashcard"
                className="min-h-[40px] px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-200 flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleMarkStatus('review')}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 border transition-colors ${
                  reviewAgainIds.has(currentCard.id)
                    ? 'bg-amber-500/20 border-amber-400/45 text-amber-200'
                    : 'liquid-glass-subtle border-white/10 text-zinc-300 hover:text-white'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Review Again</span>
              </button>
              <button
                type="button"
                onClick={() => handleMarkStatus('mastered')}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
                  masteredIds.has(currentCard.id)
                    ? 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200'
                    : 'liquid-accent-glass border-transparent text-white'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Mastered</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-2xl liquid-glass text-center text-xs text-zinc-400">
          No flashcards available in this category for Session S{session.sessionNumber}.
        </div>
      )}
    </div>
  );
};
