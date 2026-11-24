import React from 'react';
import { Layers, Mic, Sparkles, Settings } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { AppMode } from '../types/index.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS } from '../utils/motion.ts';

interface TabBarProps {
  activeMode: AppMode;
  onChangeMode: (mode: AppMode) => void;
  isContained?: boolean;
}

export const TabBar: React.FC<TabBarProps> = ({ activeMode, onChangeMode, isContained = false }) => {
  const prefersReduced = Boolean(useReducedMotion());
  const tabs: { id: AppMode; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'workspace', label: 'Workspace', icon: Layers },
    { id: 'meetings', label: 'Meetings', icon: Mic },
    { id: 'studio', label: 'Studio', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <nav
      aria-label="Application primary navigation"
      className={`${
        isContained ? 'absolute bottom-4 w-[95%]' : 'fixed bottom-3 w-[96%] max-w-xl'
      } left-1/2 -translate-x-1/2 z-40 p-1 sm:p-1.5 rounded-[28px] liquid-glass-elevated`}
    >
      <div className="flex items-center justify-between gap-0.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeMode === tab.id;

          return (
            <motion.button
              key={tab.id}
              type="button"
              data-haptic="selection"
              whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
              transition={MOTION_SPRINGS.interactive}
              onClick={() => onChangeMode(tab.id)}
              className={`relative flex-1 min-w-0 flex flex-col items-center justify-center py-1.5 px-0.5 sm:px-1 rounded-[22px] transition-colors duration-150 ${
                isActive
                  ? 'text-zinc-950'
                  : 'text-zinc-300/80 hover:text-zinc-100'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="primary-nav-pill"
                  transition={MOTION_SPRINGS.pill}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-[22px] liquid-lens-active"
                />
              )}
              <Icon className="relative z-10 w-4 h-4 shrink-0" />
              <span className="relative z-10 text-[9.5px] sm:text-[10px] mt-1 tracking-tighter sm:tracking-tight font-medium whitespace-nowrap">
                {tab.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};
