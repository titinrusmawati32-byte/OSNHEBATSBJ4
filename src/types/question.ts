export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export type QuestionSourceType = 'manual' | 'word' | 'excel' | 'pdf';

export type ImportSessionStatus = 'processing' | 'review' | 'completed' | 'cancelled';

export type ValidationStatus = 'VALID' | 'NEEDS_REVIEW' | 'FAILED';

export interface QuestionOptions {
  A: string;
  B: string;
  C: string;
  D: string;
  E?: string;
}

export interface Question {
  id: string;
  subjectId: string;
  questionNumber?: number;
  questionText: string;
  options: QuestionOptions;
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E' | '';
  explanation?: string;
  imageUrl?: string;
  imageAlt?: string;
  difficulty: QuestionDifficulty;
  createdBy: string;
  createdByName: string;
  sourceType: QuestionSourceType;
  sourceFileName?: string;
  sourcePage?: number;
  sourceSheet?: string;
  sourceRow?: number;
  sourceQuestionNumber?: number;
  extractionMethod?: string;
  extractionConfidence?: 'high' | 'medium' | 'low';
  needsReview?: boolean;
  importSessionId?: string;
  isActive: boolean;
  createdAt: any;
  updatedAt: any;

  // Compatibility helpers
  question?: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
}

export interface ParsedQuestion {
  id: string; // temporary client/subcollection id
  questionNumber?: number;
  questionText: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
    E?: string;
  };
  correctAnswer?: 'A' | 'B' | 'C' | 'D' | 'E' | '';
  explanation?: string;
  imageUrl?: string;
  imageAlt?: string;
  difficulty: QuestionDifficulty;

  // Validation & Review Engine
  validationStatus: ValidationStatus;
  needsReview: boolean;
  reviewReasons: string[];
  reviewReason?: string; // compatibility helper
  confidence: 'high' | 'medium' | 'low';
  isEdited?: boolean;
  isDuplicate?: boolean;
  hasDifferencesFromSource?: boolean;
  differenceNotes?: string[];

  // Source Mapping (Audit Trail)
  sourceFileName: string;
  sourceType: QuestionSourceType;
  sourcePage?: number;
  sourceSheet?: string;
  sourceRow?: number;
  sourceParagraphIndex?: number;
  sourceQuestionNumber?: number;
  extractionMethod: string;

  // Original raw source snippet for Side-by-Side Review
  originalSnippet: string;
  originalImageBase64?: string;
  originalText?: string;
}

export interface RawDocument {
  importId: string;
  fileName: string;
  fileType: 'word' | 'excel' | 'pdf';
  rawText: string;
  pages?: Array<{
    pageNumber: number;
    text: string;
    images?: string[];
  }>;
  sheets?: Array<{
    sheetName: string;
    headers: string[];
    rows: any[][];
    totalRows: number;
  }>;
  paragraphs?: Array<{
    text: string;
    isHeading?: boolean;
    imageIds?: string[];
  }>;
  tables?: Array<{
    headers: string[];
    rows: string[][];
  }>;
  images?: Array<{
    id: string;
    dataUrl: string;
    relatedQuestionNumber?: number;
    pageNumber?: number;
  }>;
  extractionMethod: string;
  extractionWarnings: string[];
  extractedAt: any;
}

export interface ExcelColumnMapping {
  sheetName: string;
  headerRowIndex: number;
  questionNumberCol: string;
  questionTextCol: string;
  optionACol: string;
  optionBCol: string;
  optionCCol: string;
  optionDCol: string;
  optionECol?: string;
  correctAnswerCol: string;
  explanationCol: string;
  imageCol: string;
  difficultyCol: string;
}

export interface QuestionImportSession {
  id: string;
  fileName: string;
  fileType: 'word' | 'excel' | 'pdf';
  subjectId: string;
  uploadedBy: string;
  uploadedByName: string;
  extractionMethod: string;
  totalDetected: number;
  validCount: number;
  reviewCount: number;
  failedCount: number;
  totalValid?: number; // compatibility alias
  totalNeedsReview?: number; // compatibility alias
  totalWithImages: number;
  status: ImportSessionStatus;
  rawDocument?: RawDocument;
  parsedQuestions?: ParsedQuestion[];
  isScanOnly?: boolean;
  scanWarning?: string;
  createdAt: any;
  updatedAt?: any;
  completedAt?: any;
}

export interface ImportStatsSummary {
  totalSessions: number;
  totalSuccessful: number;
  totalNeedsReview: number;
  totalFailed: number;
  totalQuestionsDetected: number;
}
