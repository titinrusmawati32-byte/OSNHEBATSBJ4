import {
  ParsedQuestion,
  QuestionDifficulty,
  ValidationStatus,
  QuestionSourceType,
} from '../../types/question';

// Normalize text for duplicate detection (whitespace and lowercased)
export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate similarity between two strings (0 to 1)
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeQuestionText(str1);
  const s2 = normalizeQuestionText(str2);
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const words1 = new Set(s1.split(' '));
  const words2 = new Set(s2.split(' '));
  let intersection = 0;
  for (const w of words1) {
    if (words2.has(w)) intersection++;
  }
  const union = new Set([...words1, ...words2]).size;
  return union > 0 ? intersection / union : 0;
}

export interface ParseOptions {
  sourceFileName?: string;
  sourceType?: QuestionSourceType;
  sourcePage?: number;
  sourceSheet?: string;
  sourceRow?: number;
  extractionMethod?: string;
  embeddedImagesMap?: Record<number, string>; // questionNumber -> dataUrl
}

/**
 * Split a single line that contains multiple inline options:
 * e.g. "A. 12 cm   B. 24 cm   C. 36 cm   D. 48 cm"
 * or "a) katak  b) belalang  c) ular  d) elang"
 * 
 * Safely parses options without breaking words containing capital letters (like "DNA", "ATP", "Diameter").
 */
export function extractInlineOptions(line: string): Record<string, string> | null {
  // Check if line contains at least 2 distinct option markers like "A. ... B. ..."
  const optionMarkerRegex = /(?:^|\s+)([A-Ea-e])[\.\)\:\-]\s+/g;
  const matches = Array.from(line.matchAll(optionMarkerRegex));
  
  if (matches.length < 2) {
    return null;
  }

  // Ensure options are sequential (e.g. A followed by B, or B followed by C)
  const letters = matches.map((m) => m[1].toUpperCase());
  const expectedSeq = ['A', 'B', 'C', 'D', 'E'];
  const firstIdx = expectedSeq.indexOf(letters[0]);
  if (firstIdx === -1) return null;

  const result: Record<string, string> = {};
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const letter = currentMatch[1].toUpperCase();
    const startIndex = currentMatch.index! + currentMatch[0].length;
    const nextMatch = matches[i + 1];
    const endIndex = nextMatch ? nextMatch.index! : line.length;
    
    const content = line.substring(startIndex, endIndex).trim();
    result[letter] = content;
  }

  return result;
}

/**
 * Detect separate answer keys section typically placed at the end of exam papers:
 * e.g. "KUNCI JAWABAN: 1. A, 2. B, 3. C, 4. D..."
 */
function extractTrailingAnswerKeys(rawText: string): Record<number, 'A' | 'B' | 'C' | 'D'> {
  const keyMap: Record<number, 'A' | 'B' | 'C' | 'D'> = {};
  
  // Look for sections like "KUNCI JAWABAN:" or "KUNCI:" at the end
  const headerMatch = rawText.match(/(?:kunci\s*jawaban|kunci\s*soal|answer\s*keys?)\s*[\:\=]/i);
  if (!headerMatch || headerMatch.index === undefined) {
    return keyMap;
  }

  const trailingSection = rawText.substring(headerMatch.index);
  const pairRegex = /(?:(?:soal|no\.?|nomor)?\s*(\d+)[\.\)\:\=\s\-]+([A-Da-d]))/g;
  let m;
  while ((m = pairRegex.exec(trailingSection)) !== null) {
    const qNum = parseInt(m[1], 10);
    const key = m[2].toUpperCase() as 'A' | 'B' | 'C' | 'D';
    if (!isNaN(qNum) && ['A', 'B', 'C', 'D'].includes(key)) {
      keyMap[qNum] = key;
    }
  }

  return keyMap;
}

/**
 * Robust, zero-hallucination parser that breaks raw text into structured questions
 * strictly according to the original document content.
 */
export function parseQuestionsFromRawText(
  rawText: string,
  options: ParseOptions = {}
): ParsedQuestion[] {
  if (!rawText || !rawText.trim()) {
    return [];
  }

  const {
    sourceFileName = 'Dokumen',
    sourceType = 'word',
    sourcePage,
    sourceSheet,
    sourceRow,
    extractionMethod = 'deterministic_text',
    embeddedImagesMap = {},
  } = options;

  // Extract any trailing answer keys if available
  const trailingKeys = extractTrailingAnswerKeys(rawText);

  // Normalize line endings
  const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = cleanText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  // Explicit question header: e.g. "Soal 1.", "No. 1:", "Nomor 1.", "Question 1:"
  const explicitQuestionStartRegex = /^(?:(?:soal|no\.?|nomor|pertanyaan|question)\s*(?:no\.?)?\s*(\d+)[\.\)\:\-]\s*)(.*)$/i;
  
  // Standard numbered start: e.g. "1.", "1)"
  const standardNumberStartRegex = /^(\d+)[\.\)]\s*(.*)$/;

  // Single option label pattern: "A.", "A)", "(A)", "[A]", "a.", "a)"
  const singleOptionRegex = /^(?:[\[\(]?([A-Ea-e])[\]\)\.\:\-]\s*)(.+)$/;

  // Answer key line patterns: "Kunci: A", "Kunci Jawaban = B", "Jawaban Benar: C", "Ans: D", "Key: A"
  const keyRegex = /^(?:kunci(?:\s*jawaban)?|jawaban(?:\s*benar)?|ans(?:wer)?|key)\s*[\:\=\-]?\s*([A-Da-d])/i;

  // Explanation line patterns: "Pembahasan: ...", "Penjelasan: ...", "Explanation: ..."
  const expRegex = /^(?:pembahasan|penjelasan|explanation)\s*[\:\=\-]?\s*(.*)$/i;

  interface QuestionRawBlock {
    num?: number;
    lines: string[];
    rawText: string;
  }

  const questionBlocks: QuestionRawBlock[] = [];
  let currentBlock: {
    num?: number;
    lines: string[];
    originalLines: string[];
    hasSeenOptions: boolean;
  } | null = null;

  let expectedNextNumber = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ignore page marker separators e.g. "--- Halaman 2 ---"
    if (/^---\s*Halaman\s*\d+\s*---$/i.test(line)) {
      continue;
    }

    // Ignore standalone header lines for trailing answer keys
    if (/^(?:kunci\s*jawaban|kunci\s*soal|answer\s*keys?)\s*[\:\=]?$/i.test(line)) {
      break; // Stop parsing question blocks when reaching trailing answer key table
    }

    // Check if line is an explicit question start (e.g. "Soal 1.", "Nomor 2:")
    const explicitMatch = line.match(explicitQuestionStartRegex);
    
    // Check if line is a standard number (e.g. "1. ...", "2) ...")
    const standardMatch = line.match(standardNumberStartRegex);

    // Check if line looks like an option
    const isOptionLine = singleOptionRegex.test(line) || extractInlineOptions(line) !== null;
    if (isOptionLine && currentBlock) {
      currentBlock.hasSeenOptions = true;
    }

    let isNewQuestionStart = false;
    let detectedNum: number | undefined = undefined;
    let remainderText = '';

    if (explicitMatch) {
      detectedNum = parseInt(explicitMatch[1], 10);
      remainderText = explicitMatch[2].trim();
      isNewQuestionStart = true;
    } else if (standardMatch) {
      const candidateNum = parseInt(standardMatch[1], 10);
      const isListItemInQuestionStem =
        currentBlock &&
        !currentBlock.hasSeenOptions &&
        (candidateNum !== expectedNextNumber || candidateNum <= 5 && (currentBlock.num || 0) >= candidateNum);

      // Parentheses format e.g. "(1) ..." is strictly an internal list inside question stem
      const isParenthesizedList = /^\(\d+\)/.test(line);

      if (isParenthesizedList && currentBlock && !currentBlock.hasSeenOptions) {
        // Part of statement list inside question
        isNewQuestionStart = false;
      } else if (!isListItemInQuestionStem) {
        // Legitimate new question
        detectedNum = candidateNum;
        remainderText = standardMatch[2].trim();
        isNewQuestionStart = true;
      }
    }

    if (isNewQuestionStart) {
      // Save existing block
      if (currentBlock && currentBlock.lines.length > 0) {
        questionBlocks.push({
          num: currentBlock.num,
          lines: currentBlock.lines,
          rawText: currentBlock.originalLines.join('\n'),
        });
      }

      const qNum = detectedNum !== undefined && !isNaN(detectedNum) ? detectedNum : expectedNextNumber;
      expectedNextNumber = qNum + 1;

      currentBlock = {
        num: qNum,
        lines: remainderText ? [remainderText] : [],
        originalLines: [line],
        hasSeenOptions: false,
      };
    } else {
      if (currentBlock) {
        currentBlock.lines.push(line);
        currentBlock.originalLines.push(line);
      } else {
        // Lines before first detected question
        // If substantial, treat as Question 1
        const lower = line.toLowerCase();
        if (
          line.length > 15 &&
          !lower.includes('petunjuk') &&
          !lower.includes('olimpiade') &&
          !lower.includes('ujian') &&
          !lower.includes('nama:')
        ) {
          currentBlock = {
            num: 1,
            lines: [line],
            originalLines: [line],
            hasSeenOptions: false,
          };
          expectedNextNumber = 2;
        }
      }
    }
  }

  // Push the final block
  if (currentBlock && currentBlock.lines.length > 0) {
    questionBlocks.push({
      num: currentBlock.num,
      lines: currentBlock.lines,
      rawText: currentBlock.originalLines.join('\n'),
    });
  }

  const parsedQuestions: ParsedQuestion[] = [];
  const seenQuestionNumbers = new Set<number>();

  questionBlocks.forEach((block, index) => {
    const qNumber = block.num || index + 1;
    let qTextLines: string[] = [];
    let optA = '';
    let optB = '';
    let optC = '';
    let optD = '';
    let optE = '';
    let currentOpt: 'A' | 'B' | 'C' | 'D' | 'E' | null = null;
    let key: 'A' | 'B' | 'C' | 'D' | '' = '';
    let explanation: string | undefined = undefined;
    let inExplanation = false;

    // First check if trailing keys provided an answer key for this question number
    if (trailingKeys[qNumber]) {
      key = trailingKeys[qNumber];
    }

    for (const line of block.lines) {
      // 1. Answer Key Line
      const kMatch = line.match(keyRegex);
      if (kMatch) {
        key = kMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D';
        currentOpt = null;
        inExplanation = false;
        continue;
      }

      // 2. Explanation Line
      const expMatch = line.match(expRegex);
      if (expMatch) {
        explanation = expMatch[1].trim();
        inExplanation = true;
        currentOpt = null;
        continue;
      }

      // 3. Inline options in one line: e.g. "A. 12 cm   B. 24 cm   C. 36 cm   D. 48 cm"
      const inlineOpts = extractInlineOptions(line);
      if (inlineOpts) {
        inExplanation = false;
        if (inlineOpts.A) optA = inlineOpts.A;
        if (inlineOpts.B) optB = inlineOpts.B;
        if (inlineOpts.C) optC = inlineOpts.C;
        if (inlineOpts.D) optD = inlineOpts.D;
        if (inlineOpts.E) optE = inlineOpts.E;
        currentOpt = null;
        continue;
      }

      // 4. Standard Option Line: "A. ...", "B) ...", "(C) ..."
      const optMatch = line.match(singleOptionRegex);
      if (optMatch) {
        const letter = optMatch[1].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E';
        const content = optMatch[2].trim();
        inExplanation = false;

        if (letter === 'A') {
          optA = content;
          currentOpt = 'A';
        } else if (letter === 'B') {
          optB = content;
          currentOpt = 'B';
        } else if (letter === 'C') {
          optC = content;
          currentOpt = 'C';
        } else if (letter === 'D') {
          optD = content;
          currentOpt = 'D';
        } else if (letter === 'E') {
          optE = content;
          currentOpt = 'E';
        }
        continue;
      }

      // 5. Continuation Lines
      if (inExplanation) {
        explanation = (explanation ? explanation + ' ' : '') + line;
      } else if (currentOpt === 'A') {
        optA += ' ' + line;
      } else if (currentOpt === 'B') {
        optB += ' ' + line;
      } else if (currentOpt === 'C') {
        optC += ' ' + line;
      } else if (currentOpt === 'D') {
        optD += ' ' + line;
      } else if (currentOpt === 'E') {
        optE += ' ' + line;
      } else {
        qTextLines.push(line);
      }
    }

    const questionText = qTextLines.join('\n').trim();

    // ─────────────────────────────────────────────────────────────────────────
    // STRICT ZERO-HALLUCINATION VALIDATION ENGINE
    // Never guess missing options or answer keys. Mark as NEEDS_REVIEW instead.
    // ─────────────────────────────────────────────────────────────────────────
    const reviewReasons: string[] = [];
    const differenceNotes: string[] = [];
    let validationStatus: ValidationStatus = 'VALID';
    let confidence: 'high' | 'medium' | 'low' = 'high';

    // 1. Question Text validation
    if (!questionText) {
      reviewReasons.push('Teks pertanyaan kosong atau tidak terdeteksi pada naskah dokumen.');
      validationStatus = 'FAILED';
      confidence = 'low';
    }

    // 2. Options validation (NEVER invent options if missing)
    if (!optA || !optB) {
      reviewReasons.push('Pilihan A atau B tidak ditemukan pada naskah dokumen asli.');
      validationStatus = 'FAILED';
      confidence = 'low';
    }

    if (!optC) {
      reviewReasons.push('Pilihan C tidak ditemukan pada naskah dokumen asli (jangan mengarang opsi).');
      if (validationStatus !== 'FAILED') validationStatus = 'NEEDS_REVIEW';
      if (confidence === 'high') confidence = 'medium';
    }

    if (!optD) {
      reviewReasons.push('Pilihan D tidak ditemukan pada naskah dokumen asli.');
      if (validationStatus !== 'FAILED') validationStatus = 'NEEDS_REVIEW';
      if (confidence === 'high') confidence = 'medium';
    }

    // Duplicate options check
    const cleanOpts = [optA, optB, optC, optD].filter(Boolean).map((o) => o.trim().toLowerCase());
    const uniqueOpts = new Set(cleanOpts);
    if (cleanOpts.length > uniqueOpts.size) {
      reviewReasons.push('Terdeteksi pilihan jawaban yang sama persis (duplikat).');
      if (validationStatus !== 'FAILED') validationStatus = 'NEEDS_REVIEW';
    }

    // 3. Answer Key validation (STRICT: Never guess key if absent)
    if (!key) {
      reviewReasons.push('Kunci jawaban tidak tercantum pada dokumen asli. Harap tentukan kunci.');
      if (validationStatus !== 'FAILED') validationStatus = 'NEEDS_REVIEW';
      if (confidence === 'high') confidence = 'medium';
    }

    // 4. Duplicate question number check
    if (seenQuestionNumbers.has(qNumber)) {
      reviewReasons.push(`Nomor soal ${qNumber} terdeteksi lebih dari satu kali dalam naskah.`);
      if (validationStatus !== 'FAILED') validationStatus = 'NEEDS_REVIEW';
    }
    seenQuestionNumbers.add(qNumber);

    // 5. Image reference check
    const imgKeywords = [
      'gambar di bawah',
      'gambar berikut',
      'gambar di samping',
      'perhatikan gambar',
      'diagram di bawah',
      'grafik berikut',
      '[gambar]',
      'figure',
    ];
    const referencesImage = imgKeywords.some((kw) => questionText.toLowerCase().includes(kw));
    const attachedImage = embeddedImagesMap[qNumber];

    if (referencesImage && !attachedImage) {
      reviewReasons.push('Teks merujuk pada gambar/diagram, namun file gambar belum terhubung.');
      if (validationStatus !== 'FAILED') validationStatus = 'NEEDS_REVIEW';
    }

    const needsReview = validationStatus !== 'VALID';

    parsedQuestions.push({
      id: `parsed_${Date.now()}_${index + 1}_${Math.random().toString(36).slice(2, 6)}`,
      questionNumber: qNumber,
      questionText: questionText || `Soal No. ${qNumber}`,
      options: {
        A: optA.trim(),
        B: optB.trim(),
        C: optC.trim(),
        D: optD.trim(),
      },
      correctAnswer: key || '',
      explanation: explanation || undefined,
      imageUrl: attachedImage || undefined,
      difficulty: 'medium',

      // Validation Status
      validationStatus,
      needsReview,
      reviewReasons,
      reviewReason: reviewReasons.length > 0 ? reviewReasons.join(' ') : undefined,
      confidence,
      hasDifferencesFromSource: differenceNotes.length > 0,
      differenceNotes,

      // Source Mapping (Requirement: Full Audit Trail)
      sourceFileName,
      sourceType,
      sourcePage,
      sourceSheet,
      sourceRow: sourceRow !== undefined ? sourceRow + index : undefined,
      sourceQuestionNumber: qNumber,
      extractionMethod,

      // Original Raw Snippet for Side-by-Side Review
      originalSnippet: block.rawText,
      originalText: block.rawText,
    });
  });

  return parsedQuestions;
}
