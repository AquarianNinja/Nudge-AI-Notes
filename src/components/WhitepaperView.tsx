import React, { useState } from 'react';
import { Copy, Download, Code2, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { WHITEPAPER_SECTIONS } from '../data/whitepaperData.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import {
  MOTION_OFFSETS,
  MOTION_SPRINGS,
  buildTabVariants,
  getTabTransitionDirection
} from '../utils/motion.ts';
import { AnimatedCheckmark } from './MotionPrimitives.tsx';

const SECTION_ORDER = WHITEPAPER_SECTIONS.map(s => s.id);

export const WhitepaperView: React.FC = () => {
  const prefersReduced = Boolean(useReducedMotion());
  const tabVariants = buildTabVariants(prefersReduced);
  const [[activeSectionId, sectionDir], setSectionState] = useState<[string, 1 | -1]>([
    WHITEPAPER_SECTIONS[0].id,
    1
  ]);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const setActiveSectionId = (nextId: string) => {
    setSectionState(([prev]) => {
      if (prev === nextId) return [prev, 1];
      return [nextId, getTabTransitionDirection(SECTION_ORDER, prev, nextId)];
    });
  };

  const activeSection = WHITEPAPER_SECTIONS.find(s => s.id === activeSectionId) || WHITEPAPER_SECTIONS[0];

  const fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    } catch {
      // ignore
    }
  };

  const handleCopyCode = (code: string, id: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).catch(() => fallbackCopy(code));
      } else {
        fallbackCopy(code);
      }
    } catch {
      fallbackCopy(code);
    }
    setCopiedCodeId(id);
    triggerHaptic('success');
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const handleDownloadMarkdown = () => {
    const fullText = WHITEPAPER_SECTIONS.map(s => {
      let sectionMd = `# ${s.title}\n\n${s.subtitle}\n\n${s.content}\n\n`;
      if (s.codeSnippet) {
        sectionMd += `### ${s.codeSnippet.filename}\n\`\`\`${s.codeSnippet.language}\n${s.codeSnippet.code}\n\`\`\`\n\n`;
      }
      return sectionMd;
    }).join('\n---\n\n');

    const blob = new Blob([fullText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Locally_Nexus_ClaimCenter_Architecture.md';
    a.click();
    URL.revokeObjectURL(url);
    triggerHaptic('success');
  };

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full px-3 sm:px-5 py-3 pb-32 overflow-y-auto">
      <div className="p-4 rounded-2xl liquid-glass mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Architecture Notes</h2>
          <p className="text-[11px] text-zinc-400">On-device MLX, RAG & ClaimCenter hybrid flows</p>
        </div>

        <motion.button
          type="button"
          data-haptic="medium"
          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
          transition={MOTION_SPRINGS.interactive}
          onClick={handleDownloadMarkdown}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-zinc-100 text-xs font-medium transition-colors shrink-0 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5 text-[#2B98FF]" />
          <span>Export</span>
        </motion.button>
      </div>

      {/* Mobile Tabs */}
      <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-2 mb-2 no-scrollbar">
        {WHITEPAPER_SECTIONS.map((section) => {
          const isSelected = activeSectionId === section.id;
          return (
            <motion.button
              key={section.id}
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={() => setActiveSectionId(section.id)}
              className={`relative text-[11px] font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors shrink-0 ${
                isSelected
                  ? 'text-zinc-950 font-semibold'
                  : 'liquid-glass-subtle text-zinc-300 hover:text-white'
              }`}
            >
              {isSelected && (
                <motion.span
                  layoutId="whitepaper-mobile-pill"
                  transition={MOTION_SPRINGS.pill}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full liquid-lens-active"
                />
              )}
              <span className="relative z-10">{section.title}</span>
            </motion.button>
          );
        })}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <aside
          aria-label="Table of Contents"
          className="hidden lg:block w-60 shrink-0 p-2.5 rounded-2xl liquid-glass lg:sticky lg:top-4"
        >
          <nav className="space-y-1">
            {WHITEPAPER_SECTIONS.map((section) => {
              const isSelected = activeSectionId === section.id;
              return (
                <motion.button
                  key={section.id}
                  type="button"
                  data-haptic="selection"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => setActiveSectionId(section.id)}
                  className={`relative w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between ${
                    isSelected
                      ? 'text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="whitepaper-toc-pill"
                      transition={MOTION_SPRINGS.pill}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xl liquid-lens-active"
                    />
                  )}
                  <span className="relative z-10 truncate pr-1">{section.title}</span>
                  <span className={`relative z-10 text-[10px] font-mono shrink-0 ${isSelected ? 'text-zinc-600' : 'text-zinc-500'}`}>
                    {section.readTime}
                  </span>
                </motion.button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 w-full rounded-2xl liquid-glass p-4 sm:p-6 overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={sectionDir}>
            <motion.div
              key={activeSection.id}
              custom={sectionDir}
              variants={tabVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className="border-b border-white/10 pb-3 mb-4">
                <span className="text-[11px] font-mono text-zinc-400">{activeSection.readTime}</span>
                <h1 className="text-lg sm:text-xl font-semibold text-zinc-100 mt-1 tracking-tight">
                  {activeSection.title}
                </h1>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">{activeSection.subtitle}</p>
              </div>

              <div className="text-xs sm:text-sm text-zinc-200 leading-relaxed whitespace-pre-line">
                {activeSection.content}
              </div>

              {activeSection.keyTakeaways && (
                <div className="mt-5 p-4 rounded-xl liquid-glass-subtle">
                  <h4 className="text-[11px] font-medium text-zinc-400 mb-2">Key Points</h4>
                  <ul className="space-y-1 list-disc pl-4 text-xs text-zinc-200">
                    {activeSection.keyTakeaways.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activeSection.codeSnippet && (
                <div className="mt-5 rounded-xl liquid-glass-subtle overflow-hidden">
                  <div className="flex items-center justify-between px-3.5 py-2 bg-white/5 border-b border-white/10 text-xs">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-3.5 h-3.5 text-[#2B98FF]" />
                      <span className="font-mono text-zinc-100">{activeSection.codeSnippet.filename}</span>
                    </div>

                    <motion.button
                      type="button"
                      data-haptic="selection"
                      whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                      transition={MOTION_SPRINGS.interactive}
                      onClick={() => handleCopyCode(activeSection.codeSnippet!.code, activeSection.id)}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-zinc-100 transition-colors whitespace-nowrap shrink-0"
                    >
                      {copiedCodeId === activeSection.id ? (
                        <>
                          <AnimatedCheckmark className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-300">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </motion.button>
                  </div>

                  <pre className="p-3.5 text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed max-h-80">
                    <code>{activeSection.codeSnippet.code}</code>
                  </pre>
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
                {(() => {
                  const currentIndex = WHITEPAPER_SECTIONS.findIndex(s => s.id === activeSectionId);
                  const prev = WHITEPAPER_SECTIONS[currentIndex - 1];
                  const next = WHITEPAPER_SECTIONS[currentIndex + 1];

                  return (
                    <>
                      {prev ? (
                        <motion.button
                          type="button"
                          data-haptic="selection"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={() => setActiveSectionId(prev.id)}
                          className="text-xs text-zinc-400 hover:text-zinc-100"
                        >
                          ← {prev.title}
                        </motion.button>
                      ) : (
                        <div />
                      )}

                      {next ? (
                        <motion.button
                          type="button"
                          data-haptic="selection"
                          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                          transition={MOTION_SPRINGS.interactive}
                          onClick={() => setActiveSectionId(next.id)}
                          className="text-xs text-zinc-100 hover:text-white font-medium flex items-center gap-1"
                        >
                          <span>{next.title}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </motion.button>
                      ) : (
                        <div />
                      )}
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};
