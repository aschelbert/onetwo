import * as pdfjsLib from 'pdfjs-dist';
import type { BylawsConfig } from '@/store/useBuildingStore';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

// ─── Types ───────────────────────────────────────────────────

export type Confidence = 'high' | 'medium' | 'low';

export interface ExtractedValue<T = unknown> {
  value: T;
  confidence: Confidence;
  sourceSnippet: string;
  pageNumber: number;
}

export interface BylawsParseResult {
  boardSpendingLimit?: ExtractedValue<number>;
  quorumPct?: ExtractedValue<number>;
  fiscalYearStartMonth?: ExtractedValue<number>;
  annualMeetingMonth?: ExtractedValue<number>;
  meetingCadence?: ExtractedValue<'monthly' | 'bimonthly' | 'quarterly'>;
  boardNoticeHours?: ExtractedValue<number>;
  assessmentCapPct?: ExtractedValue<number>;
  ownerVoteThreshold?: ExtractedValue<number>;
  pagesExtracted: number;
  textLength: number;
}

// ─── Helpers ─────────────────────────────────────────────────

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function monthNameToNumber(name: string): number {
  const idx = MONTH_NAMES.indexOf(name.toLowerCase());
  return idx >= 0 ? idx + 1 : 0;
}

/** Get surrounding context (±chars) around a match for the source snippet */
function snippet(text: string, matchIndex: number, matchLength: number, radius = 60): string {
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(text.length, matchIndex + matchLength + radius);
  let s = text.slice(start, end).replace(/\s+/g, ' ').trim();
  if (start > 0) s = '...' + s;
  if (end < text.length) s = s + '...';
  return s;
}

/** Find which page a character offset falls on */
function pageForOffset(pageOffsets: number[], offset: number): number {
  for (let i = pageOffsets.length - 1; i >= 0; i--) {
    if (offset >= pageOffsets[i]) return i + 1;
  }
  return 1;
}

// ─── PDF Text Extraction ─────────────────────────────────────

async function extractText(dataUrl: string): Promise<{ pages: string[]; fullText: string; pageOffsets: number[] }> {
  const base64 = dataUrl.split(',')[1];
  if (!base64) throw new Error('Invalid data URL');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  const pageOffsets: number[] = [];
  let fullText = '';

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');
    pageOffsets.push(fullText.length);
    pages.push(pageText);
    fullText += pageText + '\n';
  }

  return { pages, fullText, pageOffsets };
}

// ─── Regex Extractors ────────────────────────────────────────

type Extractor<T> = (text: string, pageOffsets: number[]) => ExtractedValue<T> | undefined;

const extractSpendingLimit: Extractor<number> = (text, pageOffsets) => {
  // "shall not exceed $5,000" / "spending limit of $10,000" / "spending authority...up to $5,000"
  const pattern = /(?:spending\s+(?:limit|authority|cap)|shall\s+not\s+exceed|not\s+to\s+exceed|up\s+to)\s*(?:of\s+)?\$?([\d,]+)/gi;
  const match = pattern.exec(text);
  if (!match) return undefined;
  const value = parseInt(match[1].replace(/,/g, ''), 10);
  if (isNaN(value) || value <= 0) return undefined;
  return {
    value,
    confidence: /spending\s+limit/i.test(match[0]) ? 'high' : 'medium',
    sourceSnippet: snippet(text, match.index, match[0].length),
    pageNumber: pageForOffset(pageOffsets, match.index),
  };
};

const extractQuorum: Extractor<number> = (text, pageOffsets) => {
  // "quorum of 25%" / "quorum shall be 25 percent" / "constituting a quorum (25%)"
  const pattern = /quorum\s+(?:of|shall\s+be|requires?|is|consisting\s+of|constituting)?\s*(?:\(?\s*)?(\d+(?:\.\d+)?)\s*%/gi;
  const match = pattern.exec(text);
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  if (isNaN(value) || value <= 0 || value > 100) return undefined;
  return {
    value,
    confidence: 'high',
    sourceSnippet: snippet(text, match.index, match[0].length),
    pageNumber: pageForOffset(pageOffsets, match.index),
  };
};

const extractFiscalYearStart: Extractor<number> = (text, pageOffsets) => {
  // "fiscal year shall commence in January" / "fiscal year beginning January 1"
  const monthPattern = MONTH_NAMES.join('|');
  const pattern = new RegExp(
    `fiscal\\s+year\\s+(?:shall\\s+)?(?:commence|begin(?:ning)?|start)\\s*(?:in|on)?\\s*(${monthPattern})`,
    'gi'
  );
  const match = pattern.exec(text);
  if (!match) return undefined;
  const value = monthNameToNumber(match[1]);
  if (!value) return undefined;
  return {
    value,
    confidence: 'high',
    sourceSnippet: snippet(text, match.index, match[0].length),
    pageNumber: pageForOffset(pageOffsets, match.index),
  };
};

const extractAnnualMeetingMonth: Extractor<number> = (text, pageOffsets) => {
  // "annual meeting held in April" / "annual meeting shall be held in the month of April"
  const monthPattern = MONTH_NAMES.join('|');
  const pattern = new RegExp(
    `annual\\s+meeting\\s+(?:shall\\s+be\\s+)?(?:held|conducted|scheduled|convened)\\s+(?:in\\s+(?:the\\s+month\\s+of\\s+)?)?(?:during\\s+)?(?:the\\s+month\\s+of\\s+)?(${monthPattern})`,
    'gi'
  );
  const match = pattern.exec(text);
  if (!match) return undefined;
  const value = monthNameToNumber(match[1]);
  if (!value) return undefined;
  return {
    value,
    confidence: 'high',
    sourceSnippet: snippet(text, match.index, match[0].length),
    pageNumber: pageForOffset(pageOffsets, match.index),
  };
};

const extractMeetingCadence: Extractor<'monthly' | 'bimonthly' | 'quarterly'> = (text, pageOffsets) => {
  // "meetings shall be held monthly" / "regular meetings on a quarterly basis"
  const pattern = /(?:regular\s+)?meetings?\s+(?:shall\s+be\s+)?(?:held|conducted|scheduled|convened)\s+(?:on\s+a\s+)?(monthly|bi-?monthly|quarterly)/gi;
  const match = pattern.exec(text);
  if (!match) return undefined;
  const raw = match[1].toLowerCase().replace('-', '');
  const value = raw === 'monthly' ? 'monthly' : raw === 'bimonthly' ? 'bimonthly' : 'quarterly';
  return {
    value,
    confidence: 'high',
    sourceSnippet: snippet(text, match.index, match[0].length),
    pageNumber: pageForOffset(pageOffsets, match.index),
  };
};

const extractBoardNotice: Extractor<number> = (text, pageOffsets) => {
  // "48 hours notice" / "notice of at least 72 hours" / "5 days notice"
  const pattern = /(?:notice\s+of\s+(?:at\s+least\s+)?|(?:at\s+least\s+)?(\d+)\s+(?:hours?|days?)\s+(?:prior\s+)?(?:written\s+)?notice)/gi;
  // Try a more targeted approach
  const patterns = [
    /(\d+)\s+hours?\s+(?:prior\s+)?(?:written\s+)?notice/gi,
    /notice\s+of\s+(?:at\s+least\s+)?(\d+)\s+hours?/gi,
    /(\d+)\s+days?\s+(?:prior\s+)?(?:written\s+)?notice/gi,
    /notice\s+of\s+(?:at\s+least\s+)?(\d+)\s+days?/gi,
  ];

  for (const p of patterns) {
    const match = p.exec(text);
    if (match) {
      let value = parseInt(match[1], 10);
      if (isNaN(value) || value <= 0) continue;
      // Convert days to hours
      const isDays = /days?/i.test(match[0]);
      if (isDays) value = value * 24;
      return {
        value,
        confidence: isDays ? 'medium' : 'high',
        sourceSnippet: snippet(text, match.index, match[0].length),
        pageNumber: pageForOffset(pageOffsets, match.index),
      };
    }
  }
  return undefined;
};

const extractAssessmentCap: Extractor<number> = (text, pageOffsets) => {
  // "assessments shall not increase more than 15%" / "assessment cap of 10%"
  const pattern = /assess(?:ment)?s?\s+(?:shall\s+)?(?:not\s+)?(?:increase|be\s+increased|raise|cap)\s*(?:more\s+than|by\s+more\s+than|exceed|in\s+excess\s+of|of)?\s*(\d+(?:\.\d+)?)\s*%/gi;
  const match = pattern.exec(text);
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  if (isNaN(value) || value <= 0 || value > 100) return undefined;
  return {
    value,
    confidence: 'high',
    sourceSnippet: snippet(text, match.index, match[0].length),
    pageNumber: pageForOffset(pageOffsets, match.index),
  };
};

const extractOwnerVoteThreshold: Extractor<number> = (text, pageOffsets) => {
  // "vote of 66.7% of owners" / "approval of 67% of the unit owners"
  const pattern = /(?:vote|approval|consent)\s+of\s+(\d+(?:\.\d+)?)\s*%\s*(?:of\s+(?:the\s+)?(?:unit\s+)?owners?|of\s+(?:the\s+)?members?)/gi;
  const match = pattern.exec(text);
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  if (isNaN(value) || value <= 0 || value > 100) return undefined;
  return {
    value,
    confidence: 'high',
    sourceSnippet: snippet(text, match.index, match[0].length),
    pageNumber: pageForOffset(pageOffsets, match.index),
  };
};

// ─── Main Parser ─────────────────────────────────────────────

export async function parseBylawsPdf(dataUrl: string): Promise<BylawsParseResult> {
  const { fullText, pageOffsets, pages } = await extractText(dataUrl);

  return {
    boardSpendingLimit: extractSpendingLimit(fullText, pageOffsets),
    quorumPct: extractQuorum(fullText, pageOffsets),
    fiscalYearStartMonth: extractFiscalYearStart(fullText, pageOffsets),
    annualMeetingMonth: extractAnnualMeetingMonth(fullText, pageOffsets),
    meetingCadence: extractMeetingCadence(fullText, pageOffsets),
    boardNoticeHours: extractBoardNotice(fullText, pageOffsets),
    assessmentCapPct: extractAssessmentCap(fullText, pageOffsets),
    ownerVoteThreshold: extractOwnerVoteThreshold(fullText, pageOffsets),
    pagesExtracted: pages.length,
    textLength: fullText.length,
  };
}

// ─── Convert to store-compatible partial config ──────────────

export function toPartialConfig(result: BylawsParseResult): Partial<BylawsConfig> {
  const config: Partial<BylawsConfig> = {};
  if (result.boardSpendingLimit) config.boardSpendingLimit = result.boardSpendingLimit.value;
  if (result.quorumPct) config.quorumPct = result.quorumPct.value;
  if (result.fiscalYearStartMonth) config.fiscalYearStartMonth = result.fiscalYearStartMonth.value;
  if (result.annualMeetingMonth) config.annualMeetingMonth = result.annualMeetingMonth.value;
  if (result.meetingCadence) config.meetingCadence = result.meetingCadence.value;
  if (result.boardNoticeHours) config.boardNoticeHours = result.boardNoticeHours.value;
  if (result.assessmentCapPct) config.assessmentCapPct = result.assessmentCapPct.value;
  if (result.ownerVoteThreshold) config.ownerVoteThreshold = result.ownerVoteThreshold.value;
  return config;
}
