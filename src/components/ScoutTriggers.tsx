import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUp,
  ChevronDown,
  Compass,
  Globe,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import { AnimatePresence, PanInfo, motion, useReducedMotion } from 'motion/react';
import type {
  ScoutEntryPoint,
  ScoutIntent,
  ScoutScope
} from '../types/index.ts';
import {
  SCOUT_QUICK_INTENTS,
  detectInlineScoutCommand,
  hasSeenScoutGestureCoach,
  markScoutGestureCoachSeen
} from '../utils/scoutAgent.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  MOTION_TRANSITIONS
} from '../utils/motion.ts';

interface ScoutOrbTriggerProps {
  onLaunch: (opts: {
    intent: ScoutIntent;
    scope?: ScoutScope;
    entryPoint: ScoutEntryPoint;
  }) => void;
  label?: string;
  compact?: boolean;
  disabled?: boolean;
  layoutId?: string;
  className?: string;
}

/**
 * Primary discoverable Scout glass orb button.
 * - Tap launches Scout immediately.
 * - Press-and-hold (450ms) OR accessible chevron button opens quick-intent menu.
 */
export const ScoutOrbTrigger: React.FC<ScoutOrbTriggerProps> = ({
  onLaunch,
  label = 'Scout',
  compact = false,
  disabled = false,
  layoutId,
  className = ''
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ top: number; right: number } | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldOpenedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuPortalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      setMenuCoords(null);
      return;
    }

    const updatePosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setMenuCoords({
        top: rect.bottom + 8,
        right: Math.max(12, window.innerWidth - rect.right)
      });
    };

    updatePosition();

    const handleOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!menuPortalRef.current || !menuPortalRef.current.contains(target))
      ) {
        setMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    window.addEventListener('keydown', handleEsc);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      window.removeEventListener('keydown', handleEsc);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [menuOpen]);

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const handlePointerDown = () => {
    if (disabled) return;
    heldOpenedRef.current = false;
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      heldOpenedRef.current = true;
      triggerHaptic('medium');
      setMenuOpen(true);
    }, 450);
  };

  const handlePointerUpOrCancel = () => {
    clearHoldTimer();
  };

  const handlePrimaryClick = () => {
    if (disabled) return;
    if (heldOpenedRef.current) {
      heldOpenedRef.current = false;
      return;
    }
    triggerHaptic('medium');
    setMenuOpen(false);
    onLaunch({ intent: 'custom', entryPoint: 'orb' });
  };

  return (
    <div ref={containerRef} className={`relative inline-flex items-center shrink-0 ${className}`}>
      <div className="inline-flex items-center rounded-full liquid-accent-glass overflow-hidden border border-[#54B0FF]/50 shadow-[0_6px_18px_-6px_rgba(15,127,255,0.65)]">
        <motion.button
          type="button"
          layoutId={prefersReduced ? undefined : layoutId}
          disabled={disabled}
          data-haptic="off"
          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
          transition={MOTION_SPRINGS.interactive}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUpOrCancel}
          onPointerCancel={handlePointerUpOrCancel}
          onPointerLeave={handlePointerUpOrCancel}
          onContextMenu={(e) => {
            e.preventDefault();
            triggerHaptic('selection');
            setMenuOpen((prev) => !prev);
          }}
          onClick={handlePrimaryClick}
          aria-label="Scout web search"
          title="Tap to Scout · Hold or click arrow for quick intents"
          className={`relative min-h-[36px] flex items-center gap-1.5 font-semibold text-white whitespace-nowrap disabled:opacity-45 ${
            compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
          } ${!prefersReduced ? 'motion-shimmer' : ''}`}
        >
          <Compass className="w-3.5 h-3.5 shrink-0" />
          <span>{label}</span>
        </motion.button>

        <button
          type="button"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Scout quick intents menu"
          onClick={() => {
            triggerHaptic('selection');
            setMenuOpen((prev) => !prev);
          }}
          className="min-h-[36px] min-w-[28px] px-1.5 flex items-center justify-center border-l border-white/25 hover:bg-white/15 text-white transition-colors disabled:opacity-45"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {menuOpen && menuCoords && (
              <motion.div
                ref={menuPortalRef}
                role="menu"
                aria-label="Scout quick intents"
                style={{
                  position: 'fixed',
                  top: `${menuCoords.top}px`,
                  right: `${menuCoords.right}px`
                }}
                initial={{ opacity: 0, y: prefersReduced ? 0 : -6, scale: prefersReduced ? 1 : 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: MOTION_TRANSITIONS.elementEnter }}
                exit={{ opacity: 0, y: prefersReduced ? 0 : -4, scale: prefersReduced ? 1 : 0.96, transition: MOTION_TRANSITIONS.elementExit }}
                className="z-[999] w-60 p-1.5 rounded-2xl bg-zinc-950/92 backdrop-blur-2xl border border-white/22 shadow-[0_20px_50px_rgba(0,0,0,0.85)] space-y-0.5"
              >
                <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[#54B0FF]">
                  Quick Intents
                </div>
                {SCOUT_QUICK_INTENTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      triggerHaptic('medium');
                      setMenuOpen(false);
                      onLaunch({
                        intent: item.id,
                        scope: item.defaultScope,
                        entryPoint: 'hold_menu'
                      });
                    }}
                    className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl text-left hover:bg-white/12 transition-colors flex flex-col gap-0.5"
                  >
                    <span className="text-xs font-semibold text-zinc-100">{item.label}</span>
                    <span className="text-[10px] text-zinc-400 leading-tight">{item.description}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

interface ScoutSelectionToolbarProps {
  selectedText: string;
  onScoutSelection: (entryPoint: 'selection_bar' | 'swipe_up') => void;
  onDismiss: () => void;
  className?: string;
}

/**
 * Appears when user selects text in an editor or note card.
 * Supports:
 * 1) Tappable "Scout this" button (accessible VoiceOver / Switch Control alternative).
 * 2) Dedicated draggable swipe-up handle (drag upward > 48px) with bottom cyan edge-glow
 *    without blocking native scroll inside the surrounding editor.
 */
export const ScoutSelectionToolbar: React.FC<ScoutSelectionToolbarProps> = ({
  selectedText,
  onScoutSelection,
  onDismiss,
  className = ''
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [dragGlowActive, setDragGlowActive] = useState(false);
  const [showCoach, setShowCoach] = useState(() => !hasSeenScoutGestureCoach());
  const thresholdHapticFiredRef = useRef(false);

  const cleanText = selectedText.trim();
  if (cleanText.length < 2) return null;

  const dismissCoach = () => {
    markScoutGestureCoachSeen();
    setShowCoach(false);
  };

  const handleDrag = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const crossed = info.offset.y < -36;
    if (crossed !== dragGlowActive) {
      setDragGlowActive(crossed);
    }
    if (info.offset.y < -48 && !thresholdHapticFiredRef.current) {
      thresholdHapticFiredRef.current = true;
      triggerHaptic('selection');
    } else if (info.offset.y >= -30) {
      thresholdHapticFiredRef.current = false;
    }
  };

  const handleDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setDragGlowActive(false);
    thresholdHapticFiredRef.current = false;
    if (info.offset.y < -48 || info.velocity.y < -350) {
      dismissCoach();
      triggerHaptic('medium');
      onScoutSelection('swipe_up');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
      exit={{ opacity: 0, y: prefersReduced ? 0 : 6, transition: MOTION_TRANSITIONS.elementExit }}
      role="region"
      aria-label="Selection Scout actions"
      className={`relative rounded-2xl liquid-glass-elevated border border-[#54B0FF]/45 p-2.5 space-y-2 shadow-xl ${className}`}
    >
      {/* Cyan Edge Glow Affordance on Swipe-Up */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-3 bottom-0 h-1 rounded-full transition-opacity duration-150 ${
          dragGlowActive
            ? 'opacity-100 bg-gradient-to-r from-transparent via-[#54B0FF] to-transparent shadow-[0_0_18px_rgba(84,176,255,0.9)]'
            : 'opacity-45 bg-gradient-to-r from-transparent via-[#54B0FF]/60 to-transparent'
        }`}
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Sparkles className="w-3.5 h-3.5 text-[#54B0FF] shrink-0" />
          <span className="text-[11px] text-zinc-200 truncate">
            “{cleanText.slice(0, 64)}
            {cleanText.length > 64 ? '…' : ''}”
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <motion.button
            type="button"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={() => {
              dismissCoach();
              triggerHaptic('medium');
              onScoutSelection('selection_bar');
            }}
            className="min-h-[34px] px-3 py-1 rounded-full liquid-accent-glass text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap"
          >
            <Compass className="w-3 h-3" />
            <span>Scout this</span>
          </motion.button>

          {!prefersReduced && (
            <motion.div
              drag="y"
              dragConstraints={{ top: -72, bottom: 0 }}
              dragElastic={{ top: 0.25, bottom: 0.05 }}
              dragSnapToOrigin
              onDrag={handleDrag}
              onDragEnd={handleDragEnd}
              role="button"
              tabIndex={0}
              aria-label="Swipe up handle to launch Scout on selection"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  dismissCoach();
                  onScoutSelection('swipe_up');
                }
              }}
              title="Drag up to launch Scout"
              className={`min-h-[34px] px-2.5 py-1 rounded-full border text-[10.5px] font-mono flex items-center gap-1 cursor-grab active:cursor-grabbing touch-none select-none transition-colors ${
                dragGlowActive
                  ? 'bg-[#0F7FFF]/35 border-[#54B0FF] text-white'
                  : 'liquid-glass-subtle border-white/15 text-[#54B0FF]'
              }`}
            >
              <ArrowUp className="w-3 h-3" />
              <span>{dragGlowActive ? 'Release' : 'Swipe up'}</span>
            </motion.div>
          )}

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss selection Scout bar"
            className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showCoach && (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#0F7FFF]/12 border border-[#54B0FF]/30 text-[10.5px] text-zinc-200">
          <span>
            Tip: Swipe up on the handle or tap <strong className="text-white">Scout this</strong> to
            research highlighted text.
          </span>
          <button
            type="button"
            onClick={dismissCoach}
            className="text-[10px] font-semibold text-[#54B0FF] hover:text-white shrink-0"
          >
            Got it
          </button>
        </div>
      )}
    </motion.div>
  );
};

interface ScoutInlineTokenChipProps {
  text: string;
  onTrigger: (query: string) => void;
  onClearToken: (cleanedText: string) => void;
}

/**
 * Turns active `/web <query>` or `@scout <query>` commands inside notes into a tactile glass token chip.
 */
export const ScoutInlineTokenChip: React.FC<ScoutInlineTokenChipProps> = ({
  text,
  onTrigger,
  onClearToken
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const match = detectInlineScoutCommand(text);
  if (!match) return null;

  const query = match.query.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReduced ? 0 : 4 }}
      animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.elementEnter }}
      exit={{ opacity: 0, y: prefersReduced ? 0 : 4, transition: MOTION_TRANSITIONS.elementExit }}
      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#0F7FFF]/15 border border-[#54B0FF]/45 text-xs"
    >
      <button
        type="button"
        onClick={() => {
          triggerHaptic('medium');
          onTrigger(query);
        }}
        className="flex items-center gap-2 min-w-0 flex-1 text-left group"
      >
        <span className="px-2 py-0.5 rounded-lg liquid-accent-glass text-[10px] font-mono font-semibold shrink-0">
          {match.trigger}
        </span>
        <span className="text-zinc-100 truncate text-[11.5px] group-hover:text-white">
          {query ? `Scout “${query}”` : 'Type query after command, then tap to Scout'}
        </span>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            onTrigger(query);
          }}
          className="px-2.5 py-1 rounded-full liquid-accent-glass text-[10.5px] font-semibold"
        >
          Run
        </button>
        <button
          type="button"
          aria-label="Remove inline Scout command"
          onClick={() => {
            triggerHaptic('selection');
            const stripped = (
              text.slice(0, match.startIndex) + text.slice(match.endIndex)
            ).trimEnd();
            onClearToken(stripped);
          }}
          className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
};

interface UnifiedNotesSearchBarProps {
  query: string;
  onQueryChange: (val: string) => void;
  scope: 'notes' | 'web';
  onScopeChange: (next: 'notes' | 'web') => void;
  onDispatchWebScout: (query: string) => void;
  isSearchingNotes?: boolean;
  scoutEnabled?: boolean;
}

/**
 * Unified Search Bar for Diary / Notes with a seamless `(Notes | Web)` scope switcher.
 * Eliminates duplicate search boxes while preserving instant local filtering.
 */
export const UnifiedNotesSearchBar: React.FC<UnifiedNotesSearchBarProps> = ({
  query,
  onQueryChange,
  scope,
  onScopeChange,
  onDispatchWebScout,
  isSearchingNotes = false,
  scoutEnabled = true
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const pillId = useId();
  const effectiveScope = scoutEnabled ? scope : 'notes';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveScope === 'web' && scoutEnabled) {
      triggerHaptic('medium');
      onDispatchWebScout(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0 flex items-center">
          {effectiveScope === 'web' ? (
            <Globe className="w-3.5 h-3.5 text-[#54B0FF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          ) : (
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          )}
          <input
            type="text"
            aria-label={
              effectiveScope === 'web'
                ? 'Scout web search query'
                : 'Search diary entries'
            }
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={
              effectiveScope === 'web'
                ? 'Ask Scout across the live web…'
                : 'Search diary by keyword or meaning...'
            }
            className={`w-full pl-8 pr-20 py-2 rounded-xl liquid-glass-subtle text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden ${
              effectiveScope === 'web'
                ? 'border-[#54B0FF]/45 focus:border-[#54B0FF]'
                : 'focus:border-[#54B0FF]'
            }`}
          />

          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {effectiveScope === 'notes' && isSearchingNotes && (
              <span
                role="status"
                className="text-[10px] font-mono text-[#54B0FF] animate-pulse px-1"
              >
                Searching...
              </span>
            )}
            {query && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  onQueryChange('');
                }}
                aria-label="Clear search"
                className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {effectiveScope === 'web' && scoutEnabled && (
              <button
                type="submit"
                className="px-2.5 py-1 rounded-lg liquid-accent-glass text-[10.5px] font-semibold whitespace-nowrap"
              >
                Scout
              </button>
            )}
          </div>
        </div>

        {scoutEnabled && (
          <div
            role="tablist"
            aria-label="Search scope"
            className="flex items-center gap-0.5 p-1 rounded-xl liquid-glass-subtle shrink-0"
          >
            {(
              [
                { id: 'notes', label: 'Notes' },
                { id: 'web', label: 'Web' }
              ] as const
            ).map((opt) => {
              const active = effectiveScope === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    triggerHaptic('selection');
                    onScopeChange(opt.id);
                  }}
                  className={`relative min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
                    active ? 'text-zinc-950 font-semibold' : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId={`unified-scope-${pillId}`}
                      transition={prefersReduced ? { duration: 0.1 } : MOTION_SPRINGS.pill}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-lg liquid-lens-active"
                    />
                  )}
                  <span className="relative z-10">{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </form>
  );
};
