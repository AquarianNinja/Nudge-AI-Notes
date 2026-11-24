import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Cloud,
  Download,
  ExternalLink,
  FileCode2,
  FileDown,
  Headphones,
  Loader2,
  Presentation,
  ShieldAlert,
  UploadCloud
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type {
  AppSettings,
  GoogleDriveUploadResult,
  GwtCriterion,
  LocalDocument,
  MeetingSession,
  PodcastDialogueTurn,
  PodcastEpisode
} from '../types/index.ts';
import { useFirebaseAuth } from './FirebaseProvider.tsx';
import { uploadFileToGoogleDrive } from '../utils/googleDriveUpload.ts';
import {
  exportMeetingNotesDocument,
  sanitizeExportSlug,
  triggerBrowserDownload
} from '../utils/documentExport.ts';
import { generateSlideDeckFromContext, exportSlideDeckToMarkdown } from '../utils/slideDeck.ts';
import {
  buildClientReportPdfBytes,
  exportGwtCriteriaToMarkdown,
  generateClientPdfReport
} from '../utils/studioEngine.ts';
import { calculateEpisodeDuration, estimateSpokenDurationSec } from '../utils/audioSynthesis.ts';
import { createEpisodeOverviewWavBytes } from '../utils/audioConversion.ts';
import { triggerHaptic } from '../utils/haptics.ts';
import { MOTION_OFFSETS, MOTION_SPRINGS } from '../utils/motion.ts';
import { AnimatedCheckmark, MotionAlertBanner } from './MotionPrimitives.tsx';

export type StudioExportTargetId =
  | 'notes-md'
  | 'slides-md'
  | 'gwt-md'
  | 'report-pdf'
  | 'audio-wav';

interface StudioSaveShareStageProps {
  session: MeetingSession;
  settings: AppSettings;
  gwtCriteria: GwtCriterion[];
  reqFileName: string;
  providerLabel: string;
  clientName: string;
  preparedFor: string;
  reportTone: 'Executive' | 'Technical' | 'Client Brief';
  documents: LocalDocument[];
  localOnly: boolean;
}

interface ExportArtifactOption {
  id: StudioExportTargetId;
  label: string;
  formatLabel: string;
  description: string;
  defaultExt: string;
  mimeType: string;
  icon: React.FC<{ className?: string }>;
}

const EXPORT_ARTIFACTS: ExportArtifactOption[] = [
  {
    id: 'notes-md',
    label: 'Meeting Notes',
    formatLabel: 'Markdown (.md)',
    description: 'Executive summary, decisions, actions & risks',
    defaultExt: 'md',
    mimeType: 'text/markdown;charset=utf-8',
    icon: FileCode2
  },
  {
    id: 'slides-md',
    label: 'Slide Deck',
    formatLabel: 'Markdown (.md)',
    description: 'Structured 6-slide presentation & speaker notes',
    defaultExt: 'md',
    mimeType: 'text/markdown;charset=utf-8',
    icon: Presentation
  },
  {
    id: 'gwt-md',
    label: 'GWT Criteria',
    formatLabel: 'Markdown (.md)',
    description: 'Given/When/Then acceptance stories',
    defaultExt: 'md',
    mimeType: 'text/markdown;charset=utf-8',
    icon: FileCode2
  },
  {
    id: 'report-pdf',
    label: 'Client Report',
    formatLabel: 'PDF (.pdf)',
    description: 'Print-grade stakeholder summary & risk register',
    defaultExt: 'pdf',
    mimeType: 'application/pdf',
    icon: FileDown
  },
  {
    id: 'audio-wav',
    label: 'Audio Overview',
    formatLabel: 'WAV Audio (.wav)',
    description: 'Synthesized dual-host meeting briefing audio',
    defaultExt: 'wav',
    mimeType: 'audio/wav',
    icon: Headphones
  }
];

function buildDefaultFileName(session: MeetingSession, targetId: StudioExportTargetId): string {
  const base = sanitizeExportSlug(`s${session.sessionNumber}_${session.title}`);
  switch (targetId) {
    case 'notes-md':
      return `${base}_notes.md`;
    case 'slides-md':
      return `${base}_slides.md`;
    case 'gwt-md':
      return `${base}_gwt_criteria.md`;
    case 'report-pdf':
      return `${base}_client_report.pdf`;
    case 'audio-wav':
      return `${base}_audio_overview.wav`;
  }
}

function buildQuickEpisodeForWav(session: MeetingSession): PodcastEpisode {
  const decisions = session.items.filter((i) => i.category === 'decision');
  const actions = session.items.filter((i) => i.category === 'action');
  const turns: PodcastDialogueTurn[] = [
    {
      id: `wav-${session.id}-1`,
      speaker: 'Alex',
      speakerRole: 'Deep Tech Host',
      text: `Session ${session.sessionNumber}: ${session.title}. ${session.summary}`,
      durationSec: estimateSpokenDurationSec(session.summary) + 2,
      citations: [1]
    },
    {
      id: `wav-${session.id}-2`,
      speaker: 'Maya',
      speakerRole: 'Practical Synthesizer',
      text:
        decisions.length > 0
          ? decisions.map((d) => d.text).join(' ')
          : actions.map((a) => a.text).join(' ') || session.title,
      durationSec: 6.5,
      citations: [1]
    }
  ];
  const duration = calculateEpisodeDuration(turns);
  return {
    id: `wav-ep-${session.id}`,
    title: `${session.title} — Audio Overview`,
    subtitle: `Session S${session.sessionNumber}`,
    topic: `Meeting S${session.sessionNumber}`,
    durationMinutes: Number((duration.totalSec / 60).toFixed(1)) || 1,
    hosts: {
      alex: { name: 'Alex', voice: 'Evan', tone: 'Architect' },
      maya: { name: 'Maya', voice: 'Zoe', tone: 'Lead Dev' }
    },
    coverGradient: 'from-zinc-800 to-zinc-900',
    sourceDocumentIds: [session.id],
    dialogue: turns
  };
}

export const StudioSaveShareStage: React.FC<StudioSaveShareStageProps> = ({
  session,
  settings,
  gwtCriteria,
  reqFileName,
  providerLabel,
  clientName,
  preparedFor,
  reportTone,
  documents,
  localOnly
}) => {
  const prefersReduced = Boolean(useReducedMotion());
  const {
    user,
    driveAccessToken,
    isSigningIn,
    authError,
    connectGoogleDrive,
    clearAuthError
  } = useFirebaseAuth();

  const [selectedTargetId, setSelectedTargetId] = useState<StudioExportTargetId>('notes-md');
  const [fileName, setFileName] = useState<string>(() =>
    buildDefaultFileName(session, 'notes-md')
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<GoogleDriveUploadResult | null>(null);
  const [downloadedFileName, setDownloadedFileName] = useState<string | null>(null);

  useEffect(() => {
    setFileName(buildDefaultFileName(session, selectedTargetId));
    setUploadResult(null);
    setUploadError(null);
  }, [session.id, selectedTargetId]);

  const activeSpec = useMemo(
    () => EXPORT_ARTIFACTS.find((a) => a.id === selectedTargetId) || EXPORT_ARTIFACTS[0],
    [selectedTargetId]
  );

  const buildDeliverableBytes = (): {
    fileName: string;
    mimeType: string;
    data: string | Uint8Array;
    formatLabel: string;
  } => {
    const cleanName = fileName.trim() || buildDefaultFileName(session, selectedTargetId);
    switch (selectedTargetId) {
      case 'notes-md': {
        const exported = exportMeetingNotesDocument(session, 'markdown');
        return { ...exported, fileName: cleanName };
      }
      case 'slides-md': {
        const deck = generateSlideDeckFromContext({
          topic: session.title,
          sourceType: 'meeting',
          audience: 'Architecture Review',
          slideCount: 6,
          meetingSession: session,
          documents,
          settings
        });
        return {
          fileName: cleanName,
          mimeType: 'text/markdown;charset=utf-8',
          data: exportSlideDeckToMarkdown(deck),
          formatLabel: 'Markdown (.md)'
        };
      }
      case 'gwt-md': {
        return {
          fileName: cleanName,
          mimeType: 'text/markdown;charset=utf-8',
          data: exportGwtCriteriaToMarkdown(gwtCriteria, reqFileName, providerLabel),
          formatLabel: 'Markdown (.md)'
        };
      }
      case 'report-pdf': {
        const report = generateClientPdfReport({
          clientName,
          preparedFor,
          tone: reportTone,
          session,
          gwtCount: gwtCriteria.length,
          providerLabel
        });
        return {
          fileName: cleanName,
          mimeType: 'application/pdf',
          data: buildClientReportPdfBytes(report),
          formatLabel: 'PDF (.pdf)'
        };
      }
      case 'audio-wav': {
        const episode = buildQuickEpisodeForWav(session);
        return {
          fileName: cleanName,
          mimeType: 'audio/wav',
          data: createEpisodeOverviewWavBytes(episode),
          formatLabel: 'WAV Audio (.wav)'
        };
      }
    }
  };

  const handleDownloadLocal = () => {
    const payload = buildDeliverableBytes();
    triggerBrowserDownload(payload);
    setDownloadedFileName(payload.fileName);
    triggerHaptic('success');
    setTimeout(() => setDownloadedFileName(null), 2600);
  };

  const handleUploadToDrive = async () => {
    if (localOnly || isUploading) {
      triggerHaptic('warning');
      return;
    }
    setUploadError(null);
    setUploadResult(null);
    clearAuthError();

    let token = driveAccessToken;
    if (!token) {
      token = await connectGoogleDrive();
      if (!token) {
        triggerHaptic('warning');
        return;
      }
    }

    setIsUploading(true);
    try {
      const payload = buildDeliverableBytes();
      const result = await uploadFileToGoogleDrive({
        accessToken: token,
        fileName: payload.fileName,
        mimeType: payload.mimeType,
        content: payload.data,
        localOnly
      });
      setUploadResult(result);
      triggerHaptic('success');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to upload file to Google Drive.');
      triggerHaptic('warning');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Artifact Picker */}
      <div className="p-4 rounded-2xl liquid-glass space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-[#2B98FF] shrink-0" />
              <h3 className="text-xs font-semibold text-zinc-100">Save &amp; Share Deliverables</h3>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Upload Session S{session.sessionNumber} deliverables directly to Google Drive or save files locally.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 gap-2">
          {EXPORT_ARTIFACTS.map((item) => {
            const Icon = item.icon;
            const active = selectedTargetId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  triggerHaptic('selection');
                  setSelectedTargetId(item.id);
                }}
                className={`p-3 rounded-xl border text-left transition-colors space-y-1 ${
                  active
                    ? 'bg-[#0F7FFF]/15 border-[#54B0FF]/55 text-zinc-50'
                    : 'liquid-glass-subtle border-white/10 text-zinc-300 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-3.5 h-3.5 text-[#54B0FF] shrink-0" />
                    <span className="text-xs font-semibold truncate">{item.label}</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                    .{item.defaultExt}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">{item.description}</p>
              </button>
            );
          })}
        </div>

        {/* File Name */}
        <div className="space-y-1">
          <label
            htmlFor="studio-export-filename"
            className="block text-[11px] font-medium text-zinc-400"
          >
            Output File Name ({activeSpec.formatLabel})
          </label>
          <input
            id="studio-export-filename"
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            className="w-full min-h-[40px] liquid-glass-subtle rounded-xl px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-hidden focus:border-[#54B0FF]"
          />
        </div>
      </div>

      {/* Google Drive + Local Download Panel */}
      <div className="p-4 rounded-2xl liquid-glass space-y-3">
        {localOnly && (
          <MotionAlertBanner
            shakeKey="drive-local-only-lock"
            className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-amber-400/35 bg-amber-500/12 text-amber-200 text-xs"
          >
            <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <span>
              Local-Only Mode is active. Google Drive uploads are blocked to keep all data offline — local device downloads remain available.
            </span>
          </MotionAlertBanner>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-xl liquid-glass-subtle text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Cloud className="w-4 h-4 text-[#54B0FF] shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-zinc-100 truncate">
                {driveAccessToken
                  ? `Google Drive Connected${user?.email ? ` · ${user.email}` : ''}`
                  : user?.email
                    ? `Signed in as ${user.email} · Drive permission needed`
                    : 'Google Drive not connected'}
              </div>
              <div className="text-[11px] text-zinc-400">
                Scoped exclusively to files created by this app (`drive.file`).
              </div>
            </div>
          </div>

          {!localOnly && !driveAccessToken && (
            <button
              type="button"
              disabled={isSigningIn}
              onClick={() => void connectGoogleDrive()}
              className="px-3 py-1.5 rounded-full liquid-glass-subtle hover:bg-white/10 text-[11px] font-medium text-zinc-100 whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {isSigningIn ? 'Connecting…' : 'Authorize Drive'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            disabled={localOnly || isUploading || isSigningIn}
            whileTap={
              prefersReduced || localOnly ? undefined : { scale: MOTION_OFFSETS.tapScale }
            }
            transition={MOTION_SPRINGS.interactive}
            onClick={() => void handleUploadToDrive()}
            className="min-h-[42px] px-4 py-2 rounded-full liquid-accent-glass text-xs font-semibold flex items-center gap-2 disabled:opacity-40"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Cloud className="w-4 h-4" />
            )}
            <span>
              {isUploading
                ? 'Uploading to Google Drive…'
                : driveAccessToken
                  ? 'Save to Google Drive'
                  : 'Connect & Save to Google Drive'}
            </span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={prefersReduced ? undefined : { scale: MOTION_OFFSETS.tapScale }}
            transition={MOTION_SPRINGS.interactive}
            onClick={handleDownloadLocal}
            className="min-h-[42px] px-4 py-2 rounded-full liquid-glass-subtle hover:bg-white/10 text-xs font-medium text-zinc-100 flex items-center gap-2"
          >
            <Download className="w-4 h-4 text-[#54B0FF]" />
            <span>Download to Device</span>
          </motion.button>
        </div>

        {(uploadError || authError) && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-red-400/35 bg-red-500/12 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
            <span>{uploadError || authError}</span>
          </div>
        )}

        {uploadResult && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-emerald-400/35 bg-emerald-500/12 text-xs text-emerald-200">
            <div className="flex items-center gap-2 min-w-0">
              <AnimatedCheckmark className="w-4 h-4 text-emerald-300 shrink-0" />
              <span className="truncate font-medium">
                Saved {uploadResult.name} to Google Drive
              </span>
            </div>
            {uploadResult.webViewLink && (
              <a
                href={uploadResult.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-semibold text-emerald-100 underline underline-offset-2 shrink-0"
              >
                <span>Open in Drive</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        {downloadedFileName && (
          <div className="flex items-center gap-2 text-xs text-emerald-300 font-mono">
            <AnimatedCheckmark className="w-3.5 h-3.5 text-emerald-400" />
            <span>Downloaded {downloadedFileName}</span>
          </div>
        )}
      </div>
    </div>
  );
};
