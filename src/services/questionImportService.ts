import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  QuestionImportSession,
  ParsedQuestion,
  QuestionSourceType,
  Question,
  RawDocument,
  ExcelColumnMapping,
  ImportStatsSummary,
} from '../types/question';
import { UserProfile, UserRole } from '../types/auth';
import { parseWordDocument } from '../lib/parsers/wordParser';
import {
  parseExcelDocument,
  parseExcelWithMapping,
  inspectExcelWorkbook,
  ExcelInspectionResult,
} from '../lib/parsers/excelParser';
import { parsePdfDocument } from '../lib/parsers/pdfParser';
import { checkDuplicateQuestion, createQuestion } from './questionService';

const IMPORTS_COL = 'questionImports';

// Convert doc data to QuestionImportSession
function docToSession(data: any, id: string): QuestionImportSession {
  return {
    id,
    fileName: data.fileName || '',
    fileType: data.fileType || 'word',
    subjectId: data.subjectId || 'ipa',
    uploadedBy: data.uploadedBy || '',
    uploadedByName: data.uploadedByName || '',
    extractionMethod: data.extractionMethod || 'deterministic',
    totalDetected: data.totalDetected || 0,
    validCount: data.validCount || data.totalValid || 0,
    reviewCount: data.reviewCount || data.totalNeedsReview || 0,
    failedCount: data.failedCount || 0,
    totalWithImages: data.totalWithImages || 0,
    status: data.status || 'review',
    rawDocument: data.rawDocument || undefined,
    parsedQuestions: [], // Loaded from subcollection
    isScanOnly: data.isScanOnly || false,
    scanWarning: data.scanWarning || undefined,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    completedAt: data.completedAt || null,
  };
}

// Deep remove undefined values for Firestore
function sanitizeForFirestore(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((v) => sanitizeForFirestore(v));
  } else if (obj !== null && typeof obj === 'object' && !(obj instanceof Timestamp)) {
    const newObj: any = {};
    Object.keys(obj).forEach((key) => {
      const val = obj[key];
      if (val !== undefined) {
        newObj[key] = sanitizeForFirestore(val);
      }
    });
    return newObj;
  }
  return obj;
}

// Create an import session in Firestore with subcollection
export async function createImportSession(
  sessionData: Omit<QuestionImportSession, 'id' | 'createdAt'>
): Promise<QuestionImportSession> {
  const { parsedQuestions, ...metadata } = sessionData;
  const docRef = doc(collection(db, IMPORTS_COL));
  const now = serverTimestamp();

  // Save metadata & RawDocument
  const { parsedQuestions: _, ...cleanMetadata } = metadata as any;
  const payload = sanitizeForFirestore({
    ...cleanMetadata,
    id: docRef.id,
    createdAt: now,
    updatedAt: now,
  });

  const batch = writeBatch(db);
  batch.set(docRef, payload);

  const questionsCol = collection(db, IMPORTS_COL, docRef.id, 'questions');

  if (parsedQuestions && parsedQuestions.length > 0) {
    const chunkSize = 400;
    const firstChunk = parsedQuestions.slice(0, chunkSize);
    firstChunk.forEach((q) => {
      const qRef = doc(questionsCol, q.id);
      batch.set(qRef, sanitizeForFirestore(q));
    });

    await batch.commit();

    for (let i = chunkSize; i < parsedQuestions.length; i += 400) {
      const chunkBatch = writeBatch(db);
      const chunk = parsedQuestions.slice(i, i + 400);
      chunk.forEach((q) => {
        const qRef = doc(questionsCol, q.id);
        chunkBatch.set(qRef, sanitizeForFirestore(q));
      });
      await chunkBatch.commit();
    }
  } else {
    await batch.commit();
  }

  return {
    id: docRef.id,
    fileName: metadata.fileName,
    fileType: metadata.fileType,
    subjectId: metadata.subjectId,
    uploadedBy: metadata.uploadedBy,
    uploadedByName: metadata.uploadedByName,
    extractionMethod: metadata.extractionMethod || 'deterministic',
    totalDetected: metadata.totalDetected,
    validCount: metadata.validCount,
    reviewCount: metadata.reviewCount,
    failedCount: metadata.failedCount,
    totalWithImages: metadata.totalWithImages,
    status: metadata.status,
    rawDocument: metadata.rawDocument,
    parsedQuestions,
    isScanOnly: metadata.isScanOnly,
    scanWarning: metadata.scanWarning,
    createdAt: new Date(),
  };
}

// Get import session by ID with subcollection questions
export async function getImportSession(sessionId: string): Promise<QuestionImportSession | null> {
  try {
    const snap = await getDoc(doc(db, IMPORTS_COL, sessionId));
    if (!snap.exists()) return null;

    const session = docToSession(snap.data(), snap.id);
    const qSnap = await getDocs(
      query(collection(db, IMPORTS_COL, sessionId, 'questions'), orderBy('questionNumber', 'asc'))
    );
    session.parsedQuestions = qSnap.docs.map((d) => d.data() as ParsedQuestion);
    return session;
  } catch (err) {
    console.error('Failed to get import session:', err);
    return null;
  }
}

// Update specific question inside subcollection or metadata
export async function updateImportSession(
  sessionId: string,
  updates: Partial<QuestionImportSession>
): Promise<void> {
  const { parsedQuestions, ...metadataUpdates } = updates;
  const docRef = doc(db, IMPORTS_COL, sessionId);

  if (Object.keys(metadataUpdates).length > 0) {
    const sanitizedUpdates = sanitizeForFirestore({
      ...metadataUpdates,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(docRef, sanitizedUpdates);
  }

  if (parsedQuestions && parsedQuestions.length > 0) {
    const questionsCol = collection(db, IMPORTS_COL, sessionId, 'questions');
    const batch = writeBatch(db);
    parsedQuestions.forEach((q) => {
      const qRef = doc(questionsCol, q.id);
      batch.set(qRef, sanitizeForFirestore(q), { merge: true });
    });
    await batch.commit();
  }
}

// Cancel an import session
export async function cancelImportSession(sessionId: string): Promise<void> {
  const docRef = doc(db, IMPORTS_COL, sessionId);
  await updateDoc(docRef, {
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
}

// Get import history (Admins see all; Teachers see own)
export async function getImportHistory(
  userRole: UserRole,
  userId: string
): Promise<QuestionImportSession[]> {
  try {
    let q;
    if (userRole === 'admin') {
      q = collection(db, IMPORTS_COL);
    } else {
      q = query(collection(db, IMPORTS_COL), where('uploadedBy', '==', userId));
    }

    const snap = await getDocs(q);
    const sessions: QuestionImportSession[] = [];
    snap.forEach((d) => {
      sessions.push(docToSession(d.data(), d.id));
    });

    return sessions.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  } catch (err) {
    console.error('Failed to get import history:', err);
    return [];
  }
}

// Get real import statistics for dashboard (Requirement R)
export async function getImportStats(
  userRole: UserRole,
  userId: string
): Promise<ImportStatsSummary> {
  try {
    const sessions = await getImportHistory(userRole, userId);
    let totalSuccessful = 0;
    let totalNeedsReview = 0;
    let totalFailed = 0;
    let totalQuestionsDetected = 0;

    sessions.forEach((s) => {
      totalQuestionsDetected += s.totalDetected || 0;
      if (s.status === 'completed') {
        totalSuccessful++;
      } else if (s.status === 'cancelled' || s.failedCount > 0) {
        totalFailed++;
      } else {
        totalNeedsReview++;
      }
    });

    return {
      totalSessions: sessions.length,
      totalSuccessful,
      totalNeedsReview,
      totalFailed,
      totalQuestionsDetected,
    };
  } catch (err) {
    console.error('Failed to get import stats:', err);
    return {
      totalSessions: 0,
      totalSuccessful: 0,
      totalNeedsReview: 0,
      totalFailed: 0,
      totalQuestionsDetected: 0,
    };
  }
}

export interface ProcessDocumentOptions {
  file: File;
  fileType: 'word' | 'excel' | 'pdf';
  subjectId: string;
  user: UserProfile;
  excelMapping?: ExcelColumnMapping;
  onProgress?: (step: string) => void;
}

// Inspect Excel before full processing to allow Column Mapping (Requirement E)
export async function inspectExcelFile(file: File): Promise<ExcelInspectionResult> {
  const arrayBuffer = await file.arrayBuffer();
  return inspectExcelWorkbook(arrayBuffer);
}

// Full document processing workflow with Raw Extraction & Validation Engine
export async function processDocument({
  file,
  fileType,
  subjectId,
  user,
  excelMapping,
  onProgress,
}: ProcessDocumentOptions): Promise<{
  session: QuestionImportSession;
  questions: ParsedQuestion[];
  rawDocument: RawDocument;
  isScanOnly?: boolean;
  scanWarning?: string;
  hasImageReferences?: boolean;
}> {
  onProgress?.('Membaca file naskah...');
  const arrayBuffer = await file.arrayBuffer();

  onProgress?.('Melakukan ekstraksi mentah dokumen...');
  let parsedQuestions: ParsedQuestion[] = [];
  let isScanOnly = false;
  let scanWarning: string | undefined = undefined;
  let hasImageReferences = false;
  let rawDocument: RawDocument;
  let extractionMethod = 'deterministic';

  if (fileType === 'word') {
    extractionMethod = 'mammoth_docx_structured';
    const wordResult = await parseWordDocument(arrayBuffer, file.name);
    parsedQuestions = wordResult.questions;
    hasImageReferences = wordResult.hasImageReferences;
    rawDocument = wordResult.rawDocument;
  } else if (fileType === 'excel') {
    extractionMethod = excelMapping ? 'excel_column_mapped' : 'excel_autosuggest';
    const excelResult = excelMapping
      ? parseExcelWithMapping(arrayBuffer, excelMapping, file.name)
      : parseExcelDocument(arrayBuffer, file.name);
    parsedQuestions = excelResult.questions;
    rawDocument = excelResult.rawDocument;
  } else {
    extractionMethod = 'pdf_spatial_ordering';
    const pdfResult = await parsePdfDocument(arrayBuffer, file.name);
    parsedQuestions = pdfResult.questions;
    isScanOnly = pdfResult.isScanOnly;
    scanWarning = pdfResult.scanWarning;
    rawDocument = pdfResult.rawDocument;
  }

  onProgress?.('Memeriksa potensi duplikasi dengan Bank Soal...');
  for (const q of parsedQuestions) {
    const dupCheck = await checkDuplicateQuestion(q.questionText, subjectId);
    if (dupCheck.isDuplicate) {
      q.isDuplicate = true;
      if (!q.needsReview) {
        q.needsReview = true;
        q.reviewReasons.push(
          `Kemungkinan duplikat (Kemiripan ${Math.round(dupCheck.score * 100)}% dengan soal di Bank Soal).`
        );
      }
    }
  }

  onProgress?.('Menyiapkan sesi audit & review...');
  const totalDetected = parsedQuestions.length;
  const validCount = parsedQuestions.filter((q) => q.validationStatus === 'VALID').length;
  const reviewCount = parsedQuestions.filter((q) => q.validationStatus === 'NEEDS_REVIEW').length;
  const failedCount = parsedQuestions.filter((q) => q.validationStatus === 'FAILED').length;
  const totalWithImages = parsedQuestions.filter((q) => !!q.imageUrl).length;

  const session = await createImportSession({
    fileName: file.name,
    fileType,
    subjectId,
    uploadedBy: user.uid,
    uploadedByName: user.displayName || user.name || user.username,
    extractionMethod,
    totalDetected,
    validCount,
    reviewCount,
    failedCount,
    totalWithImages,
    status: 'review',
    rawDocument,
    parsedQuestions,
    isScanOnly,
    scanWarning,
  });

  return {
    session,
    questions: parsedQuestions,
    rawDocument,
    isScanOnly,
    scanWarning,
    hasImageReferences,
  };
}

// Save approved parsed questions to final Firestore questions collection (Requirement N)
export async function saveImportedQuestions(
  importSessionId: string,
  questionsToSave: ParsedQuestion[],
  subjectId: string,
  user: UserProfile,
  sourceFileName: string,
  sourceType: QuestionSourceType
): Promise<{ savedCount: number }> {
  let savedCount = 0;

  for (const q of questionsToSave) {
    await createQuestion({
      subjectId,
      questionNumber: q.questionNumber,
      questionText: q.questionText,
      options: {
        A: q.options.A || '',
        B: q.options.B || '',
        C: q.options.C || '',
        D: q.options.D || '',
        ...(q.options.E ? { E: q.options.E } : {}),
      },
      correctAnswer: (q.correctAnswer as any) || '',
      explanation: q.explanation || '',
      imageUrl: q.imageUrl || '',
      imageAlt: q.imageAlt || '',
      difficulty: q.difficulty || 'medium',
      createdBy: user.uid,
      createdByName: user.displayName || user.name || user.username,
      sourceType,
      sourceFileName,
      sourcePage: q.sourcePage,
      sourceSheet: q.sourceSheet,
      sourceRow: q.sourceRow,
      sourceQuestionNumber: q.sourceQuestionNumber || q.questionNumber,
      extractionMethod: q.extractionMethod,
      extractionConfidence: q.confidence,
      needsReview: q.needsReview,
      importSessionId,
      isActive: true,
    });
    savedCount++;
  }

  // Update session status to completed
  await updateImportSession(importSessionId, {
    status: 'completed',
    completedAt: serverTimestamp(),
  });

  return { savedCount };
}
