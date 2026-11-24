import React, { useState } from 'react';
import { Bot, Check, Cpu, Mic, Terminal, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  GenTeamAccentColor,
  GenTeamAgent,
  GenTeamAgentVendor,
  GenTeamExecutionMode
} from '../types/index.ts';
import {
  CreateGenTeamAgentInput,
  GENTEAM_ACCENT_STYLES,
  GENTEAM_AGENT_TEMPLATES,
  GenTeamAgentTemplate,
  getAgentInitials,
  normalizeAgentHandle
} from '../utils/genTeam.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS } from '../utils/motion.ts';
import { MotionSheet } from './MotionPrimitives.tsx';

interface AddGenTeamAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingAgents: GenTeamAgent[];
  onAddAgent: (input: CreateGenTeamAgentInput) => void;
}

const VENDOR_DEFAULTS: Array<{
  id: GenTeamAgentVendor;
  label: string;
  defaultModel: string;
  defaultAccent: GenTeamAccentColor;
}> = [
  { id: 'claude', label: 'Claude (Anthropic)', defaultModel: 'Claude 3.7 Sonnet', defaultAccent: 'amber' },
  { id: 'gemini', label: 'Gemini (Google)', defaultModel: 'Gemini 2.5 Pro', defaultAccent: 'blue' },
  { id: 'wisprflow', label: 'WisprFlow AI', defaultModel: 'WisprFlow v2 Neural ASR', defaultAccent: 'teal' },
  { id: 'grok', label: 'Grok Bot (xAI)', defaultModel: 'Grok 3 Fast', defaultAccent: 'zinc' },
  { id: 'openai', label: 'OpenAI GPT', defaultModel: 'GPT-4o', defaultAccent: 'emerald' },
  { id: 'custom', label: 'Custom / Open Weight', defaultModel: 'DeepSeek-R1', defaultAccent: 'violet' }
];

const EXECUTION_MODES: Array<{
  id: GenTeamExecutionMode;
  label: string;
  Icon: React.FC<{ className?: string }>;
}> = [
  { id: 'cloud-sandbox', label: 'Cloud Sandbox', Icon: Cpu },
  { id: 'local-cli', label: 'Local CLI', Icon: Terminal },
  { id: 'voice-stream', label: 'Voice Stream', Icon: Mic }
];

const ACCENT_OPTIONS: GenTeamAccentColor[] = ['blue', 'amber', 'teal', 'zinc', 'emerald', 'violet'];

export const AddGenTeamAgentModal: React.FC<AddGenTeamAgentModalProps> = ({
  isOpen,
  onClose,
  existingAgents,
  onAddAgent
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [vendor, setVendor] = useState<GenTeamAgentVendor>('claude');
  const [modelName, setModelName] = useState('Claude 3.7 Sonnet');
  const [roleTitle, setRoleTitle] = useState('Engineering Copilot');
  const [executionMode, setExecutionMode] = useState<GenTeamExecutionMode>('cloud-sandbox');
  const [accent, setAccent] = useState<GenTeamAccentColor>('blue');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [skillsInput, setSkillsInput] = useState('Code Review, Research');

  const applyTemplate = (tpl: GenTeamAgentTemplate) => {
    triggerHaptic('selection');
    setName(tpl.name);
    setHandle(tpl.handle);
    setVendor(tpl.vendor);
    setModelName(tpl.modelName);
    setRoleTitle(tpl.roleTitle);
    setExecutionMode(tpl.executionMode);
    setAccent(tpl.accent);
    setSystemPrompt(tpl.systemPrompt);
    setSkillsInput(tpl.skills.join(', '));
  };

  const handleVendorChange = (nextVendor: GenTeamAgentVendor) => {
    setVendor(nextVendor);
    const meta = VENDOR_DEFAULTS.find(v => v.id === nextVendor);
    if (meta) {
      setModelName(meta.defaultModel);
      setAccent(meta.defaultAccent);
    }
  };

  const resetForm = () => {
    setName('');
    setHandle('');
    setVendor('claude');
    setModelName('Claude 3.7 Sonnet');
    setRoleTitle('Engineering Copilot');
    setExecutionMode('cloud-sandbox');
    setAccent('blue');
    setSystemPrompt('');
    setSkillsInput('Code Review, Research');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      triggerHaptic('warning');
      return;
    }

    const parsedSkills = skillsInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    onAddAgent({
      name: cleanName,
      handle: handle.trim() || normalizeAgentHandle(cleanName),
      vendor,
      modelName,
      roleTitle,
      accent,
      executionMode,
      systemPrompt,
      skills: parsedSkills
    });

    triggerHaptic('success');
    resetForm();
    onClose();
  };

  const previewAccent = GENTEAM_ACCENT_STYLES[accent];
  const previewHandle = normalizeAgentHandle(handle.trim() || name.trim() || 'agent');

  return (
    <MotionSheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Add AI Agent to GenTeam"
      maxWidthClass="max-w-lg"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-[#2B98FF]" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Add Agent Teammate</h3>
            <p className="text-[11px] text-zinc-400">
              Deploy a cloud bot, local CLI, or voice agent into channels & DMs
            </p>
          </div>
        </div>
        <motion.button
          type="button"
          data-haptic="selection"
          whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
          transition={MOTION_SPRINGS.interactive}
          onClick={onClose}
          aria-label="Close add agent dialog"
          className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </motion.button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-4 text-xs">
        {/* Quick-Add Templates */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="font-medium text-zinc-200">Quick-Add Presets</span>
            <span>Tap to prefill</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {GENTEAM_AGENT_TEMPLATES.map((tpl) => {
              const alreadyAdded = existingAgents.some(
                a => a.name.toLowerCase() === tpl.name.toLowerCase()
              );
              const tplStyle = GENTEAM_ACCENT_STYLES[tpl.accent];
              return (
                <motion.button
                  key={tpl.id}
                  type="button"
                  data-haptic="off"
                  whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.cardTapScale }}
                  transition={MOTION_SPRINGS.interactive}
                  onClick={() => applyTemplate(tpl)}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl liquid-glass-subtle hover:bg-white/[0.08] text-left transition-colors"
                >
                  <span
                    className={`w-7 h-7 rounded-lg border flex items-center justify-center text-[10px] font-semibold shrink-0 ${tplStyle.avatarClass}`}
                  >
                    {getAgentInitials(tpl.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium text-zinc-100 truncate">{tpl.name}</span>
                      {alreadyAdded && (
                        <span className="text-[10px] font-mono text-zinc-400 shrink-0">Added</span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">
                      {tpl.roleTitle} · {tpl.handle}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Live Teammate Preview Row */}
        <div className="flex items-center gap-3 p-3 rounded-2xl liquid-glass-subtle">
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center text-xs font-semibold shrink-0 ${previewAccent.avatarClass}`}
          >
            {getAgentInitials(name || 'New Agent')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-zinc-100 truncate">
                {name.trim() || 'New Agent Name'}
              </span>
              <span className="text-zinc-600">·</span>
              <span className="font-mono text-[#58A6FF]">{previewHandle}</span>
            </div>
            <div className="text-[11px] text-zinc-400 truncate">
              {roleTitle.trim() || 'AI Specialist'} · {modelName.trim() || 'Model'}
            </div>
          </div>
        </div>

        {/* Identity Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="genteam-agent-name" className="text-[11px] font-medium text-zinc-300 block">
              Agent Name
            </label>
            <input
              id="genteam-agent-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Claude Security, Perplexity"
              className="w-full liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-[#0F7FFF]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="genteam-agent-handle" className="text-[11px] font-medium text-zinc-300 block">
              Mention Handle
            </label>
            <input
              id="genteam-agent-handle"
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder={previewHandle}
              className="w-full liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-[#0F7FFF]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="genteam-agent-vendor" className="text-[11px] font-medium text-zinc-300 block">
              Underlying Provider
            </label>
            <select
              id="genteam-agent-vendor"
              value={vendor}
              onChange={(e) => handleVendorChange(e.target.value as GenTeamAgentVendor)}
              className="w-full liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-[#0F7FFF]"
            >
              {VENDOR_DEFAULTS.map(v => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="genteam-agent-model" className="text-[11px] font-medium text-zinc-300 block">
              Model Engine
            </label>
            <input
              id="genteam-agent-model"
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="Claude 3.7 Sonnet"
              className="w-full liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-hidden focus:border-[#0F7FFF]"
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="genteam-agent-role" className="text-[11px] font-medium text-zinc-300 block">
              Team Role
            </label>
            <input
              id="genteam-agent-role"
              type="text"
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder="e.g., Architecture Reviewer, Realtime Scout"
              className="w-full liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-[#0F7FFF]"
            />
          </div>
        </div>

        {/* Execution Mode & Color Swatches */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-300 block">Runtime Environment</span>
            <div className="flex flex-wrap gap-1">
              {EXECUTION_MODES.map(({ id, label, Icon }) => {
                const active = executionMode === id;
                return (
                  <motion.button
                    key={id}
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    onClick={() => setExecutionMode(id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] transition-colors ${
                      active
                        ? 'liquid-accent-glass font-medium'
                        : 'liquid-glass-subtle text-zinc-300 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-300 block">Identity Color</span>
            <div className="flex items-center gap-2 pt-0.5">
              {ACCENT_OPTIONS.map((colorKey) => {
                const style = GENTEAM_ACCENT_STYLES[colorKey];
                const selected = accent === colorKey;
                return (
                  <motion.button
                    key={colorKey}
                    type="button"
                    data-haptic="selection"
                    whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
                    transition={MOTION_SPRINGS.interactive}
                    aria-label={`Select ${style.label} color`}
                    onClick={() => setAccent(colorKey)}
                    className={`w-6 h-6 rounded-full border flex items-center justify-center transition-transform ${
                      selected ? 'border-white scale-110' : 'border-white/25 hover:border-white/60'
                    }`}
                    style={{ backgroundColor: style.swatchHex }}
                  >
                    {selected && (
                      <Check
                        className={`w-3.5 h-3.5 ${
                          colorKey === 'zinc' ? 'text-zinc-950' : 'text-white'
                        }`}
                      />
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Instructions & Skills */}
        <div className="space-y-1">
          <label htmlFor="genteam-agent-skills" className="text-[11px] font-medium text-zinc-300 block">
            Skills (comma-separated)
          </label>
          <input
            id="genteam-agent-skills"
            type="text"
            value={skillsInput}
            onChange={(e) => setSkillsInput(e.target.value)}
            className="w-full liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-hidden focus:border-[#0F7FFF]"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="genteam-agent-prompt" className="text-[11px] font-medium text-zinc-300 block">
            Role Directives
          </label>
          <textarea
            id="genteam-agent-prompt"
            rows={2}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Describe how this teammate should review work, write code, or hand off tasks..."
            className="w-full liquid-glass-subtle rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-[#0F7FFF] resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
          <motion.button
            type="button"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs text-zinc-200"
          >
            Cancel
          </motion.button>
          <motion.button
            type="submit"
            data-haptic="off"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            className="px-4 py-1.5 rounded-full liquid-accent-glass font-medium text-xs transition-opacity hover:opacity-95"
          >
            Deploy to GenTeam
          </motion.button>
        </div>
      </form>
    </MotionSheet>
  );
};
