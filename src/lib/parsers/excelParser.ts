import * as XLSX from 'xlsx';
import {
  ParsedQuestion,
  QuestionDifficulty,
  ValidationStatus,
  ExcelColumnMapping,
  RawDocument,
} from '../../types/question';

export interface ExcelInspectionResult {
  sheetNames: string[];
  currentSheet: string;
  headers: string[];
  totalRows: number;
  sampleRows: any[][];
  suggestedMapping: ExcelColumnMapping;
}

export interface ExcelParseResult {
  questions: ParsedQuestion[];
  sheetNames: string[];
  totalRows: number;
  rawDocument: RawDocument;
}

// Normalize column key for flexible header matching
function normalizeHeader(key: string): string {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Auto-detect suggested column mapping from headers
 */
export function suggestColumnMapping(headers: string[], sheetName: string = ''): ExcelColumnMapping {
  const mapping: ExcelColumnMapping = {
    sheetName,
    headerRowIndex: 0,
    questionNumberCol: '',
    questionTextCol: '',
    optionACol: '',
    optionBCol: '',
    optionCCol: '',
    optionDCol: '',
    optionECol: '',
    correctAnswerCol: '',
    explanationCol: '',
    imageCol: '',
    difficultyCol: '',
  };

  headers.forEach((h, idx) => {
    const norm = normalizeHeader(h);
    const colId = h || `Column_${idx + 1}`;

    if (!mapping.questionNumberCol && (norm === 'no' || norm === 'nomor' || norm === 'number' || norm === 'num')) {
      mapping.questionNumberCol = colId;
    } else if (
      !mapping.questionTextCol &&
      (norm.includes('soal') || norm.includes('pertanyaan') || norm.includes('question') || norm === 'text' || norm.includes('isisoal'))
    ) {
      mapping.questionTextCol = colId;
    } else if (!mapping.optionACol && (norm === 'a' || norm.includes('pilihana') || norm.includes('opsia') || norm === 'optionea')) {
      mapping.optionACol = colId;
    } else if (!mapping.optionBCol && (norm === 'b' || norm.includes('pilihanb') || norm.includes('opsib') || norm === 'optione_b')) {
      mapping.optionBCol = colId;
    } else if (!mapping.optionCCol && (norm === 'c' || norm.includes('pilihanc') || norm.includes('opsic') || norm === 'optione_c')) {
      mapping.optionCCol = colId;
    } else if (!mapping.optionDCol && (norm === 'd' || norm.includes('pilihand') || norm.includes('opsid') || norm === 'optione_d')) {
      mapping.optionDCol = colId;
    } else if (!mapping.optionECol && (norm === 'e' || norm.includes('pilihane') || norm.includes('opsie') || norm === 'optione_e')) {
      mapping.optionECol = colId;
    } else if (
      !mapping.correctAnswerCol &&
      (norm.includes('kunci') || norm === 'jawaban' || norm.includes('correct') || norm === 'ans' || norm === 'key')
    ) {
      mapping.correctAnswerCol = colId;
    } else if (
      !mapping.explanationCol &&
      (norm.includes('pembahasan') || norm.includes('penjelasan') || norm.includes('explanation') || norm.includes('solusi'))
    ) {
      mapping.explanationCol = colId;
    } else if (!mapping.imageCol && (norm.includes('gambar') || norm.includes('image') || norm.includes('foto') || norm.includes('url'))) {
      mapping.imageCol = colId;
    } else if (!mapping.difficultyCol && (norm.includes('tingkat') || norm.includes('kesulitan') || norm.includes('diff'))) {
      mapping.difficultyCol = colId;
    }
  });

  // Positional fallback if names did not match
  if (!mapping.questionTextCol && headers.length >= 2) {
    if (normalizeHeader(headers[0]) === 'no' || !isNaN(Number(headers[0]))) {
      mapping.questionNumberCol = headers[0];
      mapping.questionTextCol = headers[1];
      if (headers[2]) mapping.optionACol = headers[2];
      if (headers[3]) mapping.optionBCol = headers[3];
      if (headers[4]) mapping.optionCCol = headers[4];
      if (headers[5]) mapping.optionDCol = headers[5];
      if (headers[6]) mapping.correctAnswerCol = headers[6];
      if (headers[7]) mapping.explanationCol = headers[7];
    } else {
      mapping.questionTextCol = headers[0];
      if (headers[1]) mapping.optionACol = headers[1];
      if (headers[2]) mapping.optionBCol = headers[2];
      if (headers[3]) mapping.optionCCol = headers[3];
      if (headers[4]) mapping.optionDCol = headers[4];
      if (headers[5]) mapping.correctAnswerCol = headers[5];
      if (headers[6]) mapping.explanationCol = headers[6];
    }
  }

  return mapping;
}

/**
 * Inspect Excel workbook structure without parsing all rows yet
 */
export function inspectExcelWorkbook(
  fileBuffer: ArrayBuffer,
  sheetIndex: number = 0
): ExcelInspectionResult {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error('File Excel tidak memiliki lembar kerja (worksheet).');
  }

  const selectedSheetName = sheetNames[sheetIndex] || sheetNames[0];
  const worksheet = workbook.Sheets[selectedSheetName];
  if (!worksheet) {
    throw new Error(`Sheet "${selectedSheetName}" tidak ditemukan.`);
  }

  // Get raw 2D array representation
  const rawMatrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
  if (rawMatrix.length === 0) {
    return {
      sheetNames,
      currentSheet: selectedSheetName,
      headers: [],
      totalRows: 0,
      sampleRows: [],
      suggestedMapping: suggestColumnMapping([], selectedSheetName),
    };
  }

  const headerRow = (rawMatrix[0] || []).map((h, i) => String(h || `Kolom ${i + 1}`).trim());
  const sampleRows = rawMatrix.slice(1, 6);
  const suggestedMapping = suggestColumnMapping(headerRow, selectedSheetName);

  return {
    sheetNames,
    currentSheet: selectedSheetName,
    headers: headerRow,
    totalRows: Math.max(0, rawMatrix.length - 1),
    sampleRows,
    suggestedMapping,
  };
}

/**
 * Parse Excel document with specific Column Mapping confirmed by user
 */
export function parseExcelWithMapping(
  fileBuffer: ArrayBuffer,
  mapping: ExcelColumnMapping,
  fileName: string = 'Dokumen.xlsx'
): ExcelParseResult {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames || [];
  const selectedSheetName = mapping.sheetName || sheetNames[0];
  const worksheet = workbook.Sheets[selectedSheetName];

  if (!worksheet) {
    throw new Error(`Sheet "${selectedSheetName}" tidak ditemukan.`);
  }

  const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
  const questions: ParsedQuestion[] = [];
  const warnings: string[] = [];

  rawData.forEach((row, index) => {
    const rowNumber = index + 2; // Row index + header offset

    // Extract values based on mapping
    const getVal = (colKey: string | undefined): string => {
      if (!colKey) return '';
      return String(row[colKey] ?? '').trim();
    };

    const numStr = getVal(mapping.questionNumberCol);
    const parsedNum = parseInt(numStr, 10);
    const questionNumber = !isNaN(parsedNum) ? parsedNum : index + 1;

    const questionText = getVal(mapping.questionTextCol);
    const optA = getVal(mapping.optionACol);
    const optB = getVal(mapping.optionBCol);
    const optC = getVal(mapping.optionCCol);
    const optD = getVal(mapping.optionDCol);
    const optE = mapping.optionECol ? getVal(mapping.optionECol) : '';
    const keyRaw = getVal(mapping.correctAnswerCol).trim();
    const explanation = getVal(mapping.explanationCol);
    const imageUrl = getVal(mapping.imageCol);
    const diffRaw = getVal(mapping.difficultyCol).toLowerCase();

    // Skip totally blank rows
    if (!questionText && !optA && !optB && !optC && !optD && !optE) {
      return;
    }

    let difficulty: QuestionDifficulty = 'medium';
    if (diffRaw.includes('mudah') || diffRaw.includes('easy')) difficulty = 'easy';
    else if (diffRaw.includes('sulit') || diffRaw.includes('hard')) difficulty = 'hard';

    // Strict validation
    const reviewReasons: string[] = [];
    let validationStatus: ValidationStatus = 'VALID';
    let confidence: 'high' | 'medium' | 'low' = 'high';

    if (!questionText) {
      reviewReasons.push(`Pertanyaan kosong pada baris ${rowNumber}.`);
      validationStatus = 'FAILED';
      confidence = 'low';
    }

    if (!optA || !optB) {
      reviewReasons.push(`Pilihan A atau B tidak ditemukan pada baris ${rowNumber}.`);
      validationStatus = 'FAILED';
      confidence = 'low';
    }

    if (!optC) {
      reviewReasons.push('Pilihan C tidak ditemukan pada baris spreadsheet (jangan mengarang opsi).');
      if (validationStatus !== 'FAILED') validationStatus = 'NEEDS_REVIEW';
      if (confidence === 'high') confidence = 'medium';
    }

    if (!optD) {
      reviewReasons.push('Pilihan D tidak ditemukan pada baris spreadsheet.');
      if (validationStatus !== 'FAILED') validationStatus = 'NEEDS_REVIEW';
      if (confidence === 'high') confidence = 'medium';
    }

    // Sanitize answer key: handles "A", "a", "A. Padi", "Jawaban: B", "(C)"
    let validKey: 'A' | 'B' | 'C' | 'D' | 'E' | '' = '';
    const letterMatch = keyRaw.match(/([A-Ea-e])/);
    if (letterMatch) {
      validKey = letterMatch[1].toUpperCase() as any;
    } else {
      reviewReasons.push(`Kunci jawaban tidak terisi atau tidak valid ("${keyRaw}") pada baris ${rowNumber}.`);
      if (validationStatus !== 'FAILED') validationStatus = 'NEEDS_REVIEW';
      if (confidence === 'high') confidence = 'medium';
    }

    const needsReview = validationStatus !== 'VALID';

    questions.push({
      id: `parsed_excel_${Date.now()}_${index + 1}_${Math.random().toString(36).slice(2, 6)}`,
      questionNumber,
      questionText: questionText || `Soal baris ${rowNumber}`,
      options: {
        A: optA,
        B: optB,
        C: optC,
        D: optD,
        E: optE || undefined,
      },
      correctAnswer: validKey,
      explanation: explanation || undefined,
      imageUrl: imageUrl || undefined,
      difficulty,

      validationStatus,
      needsReview,
      reviewReasons,
      reviewReason: reviewReasons.length > 0 ? reviewReasons.join(' ') : undefined,
      confidence,
      hasDifferencesFromSource: false,
      differenceNotes: [],

      // Source mapping (Requirement: sourceSheet and sourceRow audit trail)
      sourceFileName: fileName,
      sourceType: 'excel',
      sourceSheet: selectedSheetName,
      sourceRow: rowNumber,
      sourceQuestionNumber: questionNumber,
      extractionMethod: 'excel_column_mapped',

      // Original snippet for side-by-side review
      originalSnippet: `[Sheet: ${selectedSheetName}, Baris: ${rowNumber}]\n` + JSON.stringify(row, null, 2),
      originalText: JSON.stringify(row),
    });
  });

  const rawDocument: RawDocument = {
    importId: `raw_excel_${Date.now()}`,
    fileName,
    fileType: 'excel',
    rawText: `Excel Workbook: ${fileName} | Sheet: ${selectedSheetName} | Total Data Rows: ${rawData.length}`,
    sheets: [
      {
        sheetName: selectedSheetName,
        headers: Object.keys(rawData[0] || {}),
        rows: rawData.map((r) => Object.values(r)),
        totalRows: rawData.length,
      },
    ],
    extractionMethod: 'excel_column_mapped',
    extractionWarnings: warnings,
    extractedAt: new Date(),
  };

  return {
    questions,
    sheetNames,
    totalRows: rawData.length,
    rawDocument,
  };
}

/**
 * Standard Excel document parse with auto-suggested column mapping
 */
export function parseExcelDocument(
  fileBuffer: ArrayBuffer,
  fileName: string = 'Dokumen.xlsx',
  sheetIndex: number = 0
): ExcelParseResult {
  const inspection = inspectExcelWorkbook(fileBuffer, sheetIndex);
  return parseExcelWithMapping(fileBuffer, inspection.suggestedMapping, fileName);
}
