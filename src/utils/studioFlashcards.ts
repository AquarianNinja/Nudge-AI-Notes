import type {
  DictionaryEntry,
  MeetingSession,
  StudioFlashcard,
  StudioFlashcardCategory
} from '../types/index.ts';

function categoryLabel(cat: 'decision' | 'action' | 'risk'): StudioFlashcardCategory {
  if (cat === 'decision') return 'Decision';
  if (cat === 'action') return 'Action';
  return 'Risk';
}

export function generateFlashcardsFromSession(
  session: MeetingSession,
  dictionaryEntries: DictionaryEntry[] = []
): StudioFlashcard[] {
  const cards: StudioFlashcard[] = [];
  const seenFronts = new Set<string>();

  const pushCard = (card: StudioFlashcard) => {
    const key = card.front.trim().toLowerCase();
    if (!key || seenFronts.has(key)) return;
    seenFronts.add(key);
    cards.push(card);
  };

  // 1. Summary card
  if (session.summary.trim()) {
    pushCard({
      id: `fc-${session.id}-summary`,
      deckCategory: 'Highlight',
      front: `What was the core takeaway from Session S${session.sessionNumber}: ${session.title}?`,
      back: session.summary.trim(),
      sourceRef: `Session S${session.sessionNumber} · Summary`,
      tags: ['Summary']
    });
  }

  // 2. Structured Decisions, Actions, Risks
  session.items.forEach((item, idx) => {
    const cat = categoryLabel(item.category);
    const promptPrefix =
      item.category === 'decision'
        ? 'What architecture or process decision was locked in'
        : item.category === 'action'
          ? `What follow-up action is assigned${item.owner ? ` to ${item.owner}` : ''}`
          : 'What risk or guardrail requires mitigation';

    pushCard({
      id: `fc-${session.id}-item-${item.id || idx}`,
      deckCategory: cat,
      front: `${promptPrefix} for "${item.topicKey.replace(/[-_]/g, ' ')}"?`,
      back: `${item.text}${item.owner ? ` (Owner: ${item.owner})` : ''}`,
      sourceRef: `Session S${session.sessionNumber} · ${cat}`,
      tags: item.owner ? [cat, item.owner] : [cat]
    });
  });

  // 3. Dictionary Key Terms mentioned in the session
  const sessionCorpus = `${session.title} ${session.summary} ${session.items
    .map((i) => i.text)
    .join(' ')} ${session.highlights.map((h) => h.text).join(' ')}`.toLowerCase();

  dictionaryEntries.forEach((entry) => {
    if (
      sessionCorpus.includes(entry.term.toLowerCase()) &&
      (entry.definition || entry.aliases?.length)
    ) {
      pushCard({
        id: `fc-${session.id}-term-${entry.id}`,
        deckCategory: 'Key Term',
        front: `Define "${entry.term}" (${entry.category}) in the context of ${session.title}`,
        back:
          entry.definition ||
          `Domain glossary entity${entry.aliases?.length ? ` · Aliases: ${entry.aliases.join(', ')}` : ''}`,
        sourceRef: `Dictionary · ${entry.category}`,
        tags: [entry.category, ...(entry.aliases || []).slice(0, 2)]
      });
    }
  });

  // 4. Transcript Highlights
  session.highlights.slice(0, 4).forEach((h, idx) => {
    pushCard({
      id: `fc-${session.id}-hl-${idx}`,
      deckCategory: 'Highlight',
      front: `What did ${h.speaker} note at ${h.timestamp} during "${session.title}"?`,
      back: h.text,
      sourceRef: `[${h.timestamp}] ${h.speaker}`,
      tags: [h.speaker]
    });
  });

  return cards;
}
