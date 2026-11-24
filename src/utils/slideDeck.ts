import {
  AppSettings,
  LocalDocument,
  MeetingSession,
  SlideAudience,
  SlideDeck,
  SlideItem
} from '../types/index.ts';
import {
  APPROACH_LABELS,
  getProviderDisplayName,
  resolveActivityModel
} from './providerRouting.ts';

export interface GenerateSlideDeckInput {
  topic: string;
  sourceType: 'meeting' | 'vault' | 'custom';
  audience: SlideAudience;
  slideCount: number;
  meetingSession?: MeetingSession;
  documents?: LocalDocument[];
  settings: AppSettings;
}

export function generateSlideDeckFromContext(input: GenerateSlideDeckInput): SlideDeck {
  const {
    topic,
    sourceType,
    audience,
    slideCount,
    meetingSession,
    documents = [],
    settings
  } = input;

  const route = settings.activityRoutes.slideDeck;
  const model = resolveActivityModel('slideDeck', route.modelId, route.approach);
  const effectiveModelName =
    route.approach === 'custom'
      ? settings.customEndpoint.modelId || model.name
      : model.name;
  const providerLabel = getProviderDisplayName(model.provider);

  const cleanTopic =
    topic.trim() ||
    (sourceType === 'meeting' && meetingSession
      ? meetingSession.title
      : 'Guidewire ClaimCenter Cloud API & FNOL Architecture');

  const sourceLabel =
    sourceType === 'meeting' && meetingSession
      ? `Meeting Session ${meetingSession.sessionNumber}`
      : sourceType === 'vault'
      ? `Workspace Sources (${documents.length} files)`
      : 'Direct Brief';

  const meetingDecisions = meetingSession?.items
    .filter(i => i.category === 'decision')
    .map(i => i.text) || [
    'Route Jutro & mobile FNOL intake through ClaimCenter Cloud API v10.',
    'Keep InitialReserve and adjuster authority caps inside Gosu pre-update rules.'
  ];

  const meetingActions = meetingSession?.items
    .filter(i => i.category === 'action' || i.category === 'risk')
    .map(i => `${i.text}${i.owner ? ` (${i.owner})` : ''}`) || [
    'Cache PolicyCenter coverage snapshot to keep lookup latency under 400ms (Priya).',
    'Automate SubrogationSummary referrals on third-party fault flags (Alex).'
  ];

  const vaultSummaryBullets =
    documents.length > 0
      ? documents.slice(0, 3).map(d => `${d.title}: ${d.summary}`)
      : [
          'ClaimCenter Cloud API exposes JSON:API composite payloads for single-round-trip FNOL.',
          'Gosu TransactionSet pre-update hooks maintain ACID reserve authority checks.'
        ];

  const allSlides: SlideItem[] = [
    {
      id: `slide-${Date.now()}-1`,
      index: 1,
      kicker: `${audience} · ${APPROACH_LABELS[route.approach]}`,
      title: cleanTopic,
      layout: 'title',
      bullets: [
        `Source: ${sourceLabel}`,
        `Pipeline: ${APPROACH_LABELS[route.approach]} · ${effectiveModelName}`,
        'Scope: Guidewire ClaimCenter FNOL, Gosu Reserves & Subrogation'
      ],
      speakerNotes: `Open with ${audience.toLowerCase()} framing. Highlight that this deck was synthesized via ${APPROACH_LABELS[route.approach]} (${effectiveModelName}) from ${sourceLabel}.`
    },
    {
      id: `slide-${Date.now()}-2`,
      index: 2,
      kicker: '01 · Architecture Split',
      title: 'Decoupled Intake vs. Transactional Core',
      layout: 'bullets',
      bullets:
        sourceType === 'meeting'
          ? meetingDecisions
          : sourceType === 'vault'
          ? vaultSummaryBullets
          : [
              'External portals & mobile FNOL call ClaimCenter Cloud API v10 composite endpoints.',
              'Synchronous reserve allocation & authority limits stay inside Gosu pre-update rules.',
              'App Events publish downstream recovery & BillingCenter webhooks asynchronously.'
            ],
      speakerNotes:
        'Explain why keeping Cloud API for external JSON:API boundaries while preserving Gosu pre-update hooks avoids upgrade conflicts.'
    },
    {
      id: `slide-${Date.now()}-3`,
      index: 3,
      kicker: '02 · Performance & SLA',
      title: 'Operational Guardrails & Targets',
      layout: 'metrics',
      bullets: [
        'PolicyCenter snapshot caching reduces peak batch FNOL latency by 72%.',
        'Automated reserve authority cap enforces $25,000 straight-through threshold.'
      ],
      metrics: [
        { label: 'PolicyCenter Sync p95', value: '340ms' },
        { label: 'Auto Reserve Cap', value: '$25,000' },
        { label: 'SIU Escalation Score', value: '>= 70' },
        { label: 'FNOL Composite Calls', value: '1 HTTP req' }
      ],
      speakerNotes:
        'Call out PolicyCenter latency reduction from 1.2s to 340ms p95 via local point-in-time endorsement caching.'
    },
    {
      id: `slide-${Date.now()}-4`,
      index: 4,
      kicker: '03 · Trade-Off Matrix',
      title: 'Cloud API vs. Gosu Plugins Fit',
      layout: 'comparison',
      bullets: [
        'Cloud API: Upgrade-safe versioning, OAuth2 boundary, ideal for Jutro & mobile.',
        'Gosu Rules: In-bundle ACID checks, zero HTTP hop for reserve authority.',
        'App Events: Replaces synchronous polling for subrogation and check-issued events.'
      ],
      speakerNotes:
        'Contrast upgrade isolation on Cloud API against transactional atomicity inside ClaimCenter JVM bundles.'
    },
    {
      id: `slide-${Date.now()}-5`,
      index: 5,
      kicker: '04 · Next Actions',
      title: audience === 'Sprint Readout' ? 'Sprint Owners & Follow-Ups' : 'Rollout Roadmap',
      layout: 'roadmap',
      bullets: meetingActions,
      speakerNotes:
        'Confirm explicit owners and closure criteria before moving to next ClaimCenter release milestone.'
    },
    {
      id: `slide-${Date.now()}-6`,
      index: 6,
      kicker: '05 · Risk & SIU Controls',
      title: 'Automated Triage & Governance',
      layout: 'bullets',
      bullets: [
        'Wire SIU referral threshold >= 70 into FNOL post-setup Gosu rule.',
        'Require supervisor override audit trail above $25,000 automated reserve limit.',
        'Validate subrogation eligibility whenever FaultRating equals TC_THIRDPARTY.'
      ],
      speakerNotes:
        'Detail compliance auditability and fraud triage safeguards.'
    },
    {
      id: `slide-${Date.now()}-7`,
      index: 7,
      kicker: '06 · Telemetry & Verification',
      title: 'Cutover Readiness Checklist',
      layout: 'bullets',
      bullets: [
        'Load test 500 concurrent composite FNOL payloads against sandbox.',
        'Verify PolicyCenter timeout circuit-breaker falls back cleanly to cached snapshot.',
        'Confirm App Events dead-letter replay for BillingCenter sync.'
      ],
      speakerNotes:
        'Review production cutover gates with claims ops and platform engineering.'
    },
    {
      id: `slide-${Date.now()}-8`,
      index: 8,
      kicker: '07 · Summary',
      title: 'Key Takeaways',
      layout: 'bullets',
      bullets: [
        'Single composite Cloud API intake cuts mobile FNOL round-trips.',
        'Gosu pre-update rules enforce statutory reserve and SIU discipline.',
        'Asynchronous App Events keep PolicyCenter & BillingCenter decoupled.'
      ],
      speakerNotes: 'Wrap up with 3 crisp executive takeaways and open floor for questions.'
    }
  ];

  const targetCount = Math.max(3, Math.min(allSlides.length, slideCount));
  const selectedSlides = allSlides.slice(0, targetCount).map((s, idx) => ({
    ...s,
    index: idx + 1
  }));

  return {
    id: `deck-${Date.now()}`,
    title: cleanTopic,
    subtitle: `${targetCount} slides · ${audience} · ${sourceLabel}`,
    audience,
    sourceLabel,
    approach: route.approach,
    modelName: effectiveModelName,
    providerLabel,
    generatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    slides: selectedSlides
  };
}

export function exportSlideDeckToMarkdown(deck: SlideDeck): string {
  const header = `# ${deck.title}\n_${deck.subtitle} · ${APPROACH_LABELS[deck.approach]} (${deck.modelName})_\n`;
  const body = deck.slides
    .map(slide => {
      const bullets = slide.bullets.map(b => `- ${b}`).join('\n');
      const metrics = slide.metrics
        ? `\nMetrics: ${slide.metrics.map(m => `${m.label}: ${m.value}`).join(' | ')}`
        : '';
      return `## Slide ${slide.index}: ${slide.title}\n${bullets}${metrics}\n\nSpeaker Notes: ${slide.speakerNotes}`;
    })
    .join('\n\n---\n\n');
  return `${header}\n${body}`;
}
