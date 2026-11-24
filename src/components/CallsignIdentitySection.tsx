import React, { useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  Fingerprint,
  Plus,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';
import { AnimatePresence, motion, PanInfo, useReducedMotion } from 'motion/react';
import type { Callsign, UserIdentity } from '../types/index.ts';
import { CALLSIGN_AVATAR_OPTIONS } from '../utils/identityCallsigns.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS, MOTION_TRANSITIONS } from '../utils/motion.ts';
import { MotionSheet } from './MotionPrimitives.tsx';

interface CallsignIdentitySectionProps {
  identity: UserIdentity;
  callsigns: Callsign[];
  onCreateCallsign: (input: { displayName: string; avatar: string; isActive: boolean }) => Promise<void>;
  onUpdateCallsign: (
    callsignId: string,
    patch: { displayName?: string; avatar?: string; isActive?: boolean }
  ) => Promise<void>;
  onDeleteCallsign: (callsignId: string) => Promise<void>;
  onReplayOnboarding?: () => void;
}

export const CallsignIdentitySection: React.FC<CallsignIdentitySectionProps> = ({
  identity,
  callsigns,
  onCreateCallsign,
  onUpdateCallsign,
  onDeleteCallsign,
  onReplayOnboarding
}) => {
  const prefersReduced = Boolean(useReducedMotion());

  const [copiedToast, setCopiedToast] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAvatar, setNewAvatar] = useState<string>(CALLSIGN_AVATAR_OPTIONS[0]);
  const [makeActiveOnCreate, setMakeActiveOnCreate] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState<string>(CALLSIGN_AVATAR_OPTIONS[0]);
  const [swipedOpenId, setSwipedOpenId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCopyUserId = async () => {
    triggerHaptic('selection');
    try {
      await navigator.clipboard.writeText(identity.userId);
    } catch {
      // Clipboard fallback in non-HTTPS contexts
      const textarea = document.createElement('textarea');
      textarea.value = identity.userId;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedToast(true);
    triggerHaptic('success');
    setTimeout(() => setCopiedToast(false), 1800);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed || isSaving) {
      setErrorMsg('Enter a Callsign name.');
      triggerHaptic('warning');
      return;
    }
    setErrorMsg(null);
    setIsSaving(true);
    try {
      await onCreateCallsign({
        displayName: trimmed,
        avatar: newAvatar,
        isActive: makeActiveOnCreate || callsigns.length === 0
      });
      setNewName('');
      setIsCreateOpen(false);
      triggerHaptic('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create Callsign.');
      triggerHaptic('warning');
    } finally {
      setIsSaving(false);
    }
  };

  const startEditing = (cs: Callsign) => {
    triggerHaptic('selection');
    setSwipedOpenId(null);
    setEditingId(cs.id);
    setEditName(cs.displayName);
    setEditAvatar(cs.avatar || CALLSIGN_AVATAR_OPTIONS[0]);
    setErrorMsg(null);
  };

  const handleSaveEdit = async (csId: string) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      setErrorMsg('Callsign name cannot be empty.');
      triggerHaptic('warning');
      return;
    }
    setIsSaving(true);
    try {
      await onUpdateCallsign(csId, {
        displayName: trimmed,
        avatar: editAvatar
      });
      setEditingId(null);
      triggerHaptic('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save Callsign.');
      triggerHaptic('warning');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (cs: Callsign) => {
    if (cs.isActive) return;
    triggerHaptic('selection');
    await onUpdateCallsign(cs.id, { isActive: true });
    triggerHaptic('success');
  };

  const handleDelete = async (csId: string) => {
    triggerHaptic('warning');
    setSwipedOpenId(null);
    if (editingId === csId) setEditingId(null);
    await onDeleteCallsign(csId);
  };

  const handleRowDragEnd = (csId: string, _e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -52 || info.velocity.x < -250) {
      triggerHaptic('selection');
      setSwipedOpenId(csId);
    } else if (info.offset.x > 36) {
      setSwipedOpenId((prev) => (prev === csId ? null : prev));
    }
  };

  return (
    <div className="space-y-4">
      {/* Read-Only Immutable Backend User ID */}
      <div className="rounded-2xl liquid-glass p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#0F7FFF]/18 border border-[#54B0FF]/35 flex items-center justify-center text-[#54B0FF] shrink-0">
              <Fingerprint className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-100">Immutable User ID</div>
              <div className="text-[11px] text-zinc-400">
                Server-issued · Scopes Nanobots, sandboxes & tasks
              </div>
            </div>
          </div>

          <motion.button
            type="button"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={() => void handleCopyUserId()}
            aria-label="Copy immutable User ID"
            className="min-h-[38px] px-3 py-1.5 rounded-xl liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-[#54B0FF] flex items-center gap-1.5 shrink-0"
          >
            {copiedToast ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </motion.button>
        </div>

        <div className="px-3 py-2.5 rounded-xl liquid-glass-subtle flex items-center justify-between gap-2">
          <code
            aria-label="Backend User ID value"
            className="font-mono text-sm font-semibold tracking-wider text-zinc-50 select-all"
          >
            {identity.userId}
          </code>
          <span className="text-[10.5px] font-mono text-zinc-400">
            {identity.linkedProvider === 'google' ? 'Google Linked' : 'Local Session'}
          </span>
        </div>

        <AnimatePresence>
          {copiedToast && (
            <motion.div
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: prefersReduced ? 0 : 4 }}
              animate={{ opacity: 1, y: 0, transition: MOTION_TRANSITIONS.microEnter }}
              exit={{ opacity: 0, transition: MOTION_TRANSITIONS.elementExit }}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-[11px] font-medium text-emerald-300 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Copied {identity.userId} to clipboard</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Callsigns Directory (Swipe Left or Tap Action Buttons for Edit / Delete) */}
      <section aria-label="Saved Callsigns" className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div>
            <span className="text-[11px] font-medium text-zinc-400">
              Your Callsigns ({callsigns.length}) · Swipe left to delete
            </span>
          </div>
          <motion.button
            type="button"
            data-haptic="selection"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={() => {
              setErrorMsg(null);
              setIsCreateOpen(true);
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full liquid-accent-glass text-[11px] font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Callsign</span>
          </motion.button>
        </div>

        {callsigns.length === 0 ? (
          <div className="rounded-2xl liquid-glass p-5 text-center space-y-1">
            <div className="text-xs font-medium text-zinc-200">No Callsigns created yet</div>
            <p className="text-[11px] text-zinc-400">
              Add a display Callsign; bots always reference {identity.userId}.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl liquid-glass divide-y divide-white/10 overflow-hidden">
            {callsigns.map((cs) => {
              const isEditing = editingId === cs.id;
              const isSwiped = swipedOpenId === cs.id;

              return (
                <div key={cs.id} className="relative overflow-hidden">
                  {/* Swipe-Revealed Delete Action */}
                  {!isEditing && (
                    <div
                      aria-hidden={!isSwiped}
                      className="absolute inset-y-0 right-0 w-24 bg-red-500/85 flex items-center justify-center"
                    >
                      <button
                        type="button"
                        onClick={() => void handleDelete(cs.id)}
                        aria-label={`Confirm swipe delete ${cs.displayName}`}
                        className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-white"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}

                  {isEditing ? (
                    <div className="p-3.5 bg-white/[0.04] space-y-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          aria-label={`Edit Callsign name for ${cs.displayName}`}
                          value={editName}
                          maxLength={48}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 min-w-0 min-h-[38px] liquid-glass-subtle rounded-xl px-3 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-[#54B0FF]"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveEdit(cs.id)}
                          aria-label="Save Callsign edits"
                          className="min-h-[38px] px-3 rounded-xl liquid-accent-glass text-xs font-semibold"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          aria-label="Cancel editing Callsign"
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl liquid-glass-subtle text-zinc-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                        {CALLSIGN_AVATAR_OPTIONS.map((av) => (
                          <button
                            key={av}
                            type="button"
                            onClick={() => setEditAvatar(av)}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 ${
                              editAvatar === av ? 'liquid-accent-glass' : 'liquid-glass-subtle'
                            }`}
                          >
                            {av}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setEditAvatar('')}
                          className={`px-2 h-8 rounded-lg text-[10.5px] shrink-0 ${
                            editAvatar === '' ? 'liquid-accent-glass' : 'liquid-glass-subtle text-zinc-300'
                          }`}
                        >
                          Glass
                        </button>
                      </div>
                    </div>
                  ) : (
                    <motion.div
                      drag={prefersReduced ? false : 'x'}
                      dragConstraints={{ left: -96, right: 0 }}
                      dragElastic={0.12}
                      animate={{ x: isSwiped ? -96 : 0 }}
                      transition={MOTION_SPRINGS.interactive}
                      onDragEnd={(_e, info) => handleRowDragEnd(cs.id, _e, info)}
                      className="relative z-10 px-3.5 py-3 bg-[#090d16]/95 flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-9 h-9 rounded-xl liquid-glass-subtle border border-white/15 flex items-center justify-center text-base shrink-0">
                          {cs.avatar ? cs.avatar : cs.displayName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-zinc-100 truncate">
                            {cs.displayName}
                          </div>
                          <div className="text-[10.5px] font-mono text-zinc-400 truncate">
                            {cs.isActive ? 'Active identity' : 'Standby'} · {cs.userId}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={cs.isActive}
                          aria-label={`Set ${cs.displayName} as active`}
                          onClick={() => void handleToggleActive(cs)}
                          className={`min-h-[34px] px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors whitespace-nowrap ${
                            cs.isActive
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                              : 'liquid-glass-subtle text-zinc-300 hover:text-white'
                          }`}
                        >
                          {cs.isActive ? 'Active' : 'Set Active'}
                        </button>

                        <button
                          type="button"
                          aria-label={`Edit ${cs.displayName}`}
                          onClick={() => startEditing(cs)}
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl liquid-glass-subtle text-zinc-300 hover:text-white"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          aria-label={`Delete ${cs.displayName}`}
                          onClick={() => void handleDelete(cs.id)}
                          className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl liquid-glass-subtle text-zinc-400 hover:text-red-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {onReplayOnboarding && (
        <button
          type="button"
          data-haptic="selection"
          onClick={onReplayOnboarding}
          className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl liquid-glass hover:bg-white/[0.08] text-xs font-medium text-zinc-200 flex items-center justify-center gap-2 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#54B0FF]" />
          <span>Replay Onboarding &amp; Account Linking</span>
        </button>
      )}

      <MotionSheet
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        ariaLabel="Add Callsign"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={(e) => void handleCreate(e)} className="p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Create Callsign</h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Display handles can repeat or share identical names.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="p-1.5 rounded-xl liquid-glass-subtle text-zinc-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            type="text"
            aria-label="New Callsign name"
            value={newName}
            maxLength={48}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Ops Lead, Research Alpha..."
            className="w-full min-h-[42px] liquid-glass-subtle rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:border-[#54B0FF]"
          />

          <div className="space-y-1.5">
            <span className="text-[11px] text-zinc-400 block">Avatar (optional)</span>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {CALLSIGN_AVATAR_OPTIONS.map((av) => {
                const selected = newAvatar === av;
                return (
                  <button
                    key={av}
                    type="button"
                    aria-label={`Select avatar ${av}`}
                    aria-pressed={selected}
                    onClick={() => {
                      triggerHaptic('selection');
                      setNewAvatar(av);
                    }}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 transition-all ${
                      selected
                        ? 'liquid-accent-glass scale-105'
                        : 'liquid-glass-subtle hover:bg-white/10'
                    }`}
                  >
                    {av}
                  </button>
                );
              })}
              <button
                type="button"
                aria-label="Use monogram glass avatar"
                aria-pressed={newAvatar === ''}
                onClick={() => {
                  triggerHaptic('selection');
                  setNewAvatar('');
                }}
                className={`min-h-[36px] px-2.5 rounded-xl text-[11px] font-medium shrink-0 transition-colors ${
                  newAvatar === ''
                    ? 'liquid-accent-glass'
                    : 'liquid-glass-subtle text-zinc-300 hover:text-white'
                }`}
              >
                Glass
              </button>
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 pt-1 cursor-pointer">
            <span className="text-xs text-zinc-200">Set as active Callsign immediately</span>
            <input
              type="checkbox"
              checked={makeActiveOnCreate}
              onChange={(e) => setMakeActiveOnCreate(e.target.checked)}
              className="w-4 h-4 accent-[#0F7FFF] rounded"
            />
          </label>

          {errorMsg && (
            <div className="text-[11px] text-amber-300 font-medium">{errorMsg}</div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="px-3 py-2 rounded-xl liquid-glass-subtle text-xs text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl liquid-accent-glass text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Save Callsign</span>
            </button>
          </div>
        </form>
      </MotionSheet>
    </div>
  );
};
