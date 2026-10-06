import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ExamAttempt, QuestionAnswer } from '../types/attempt';
import { UserProfile } from '../types/auth';
import { ExamPackage } from '../types/exam';

const ATTEMPTS_COL = 'attempts';

export const attemptService = {
  /**
   * Check if student already has an active/in_progress attempt for this exam
   */
  async getActiveAttempt(examId: string, studentId: string): Promise<ExamAttempt | null> {
    try {
      const q = query(
        collection(db, ATTEMPTS_COL),
        where('examId', '==', examId),
        where('studentId', '==', studentId)
      );
      const snapshot = await getDocs(q);
      for (const d of snapshot.docs) {
        const data = d.data();
        if (data.status === 'in_progress' || data.status === 'active') {
          return { ...data, id: d.id } as ExamAttempt;
        }
      }
      return null;
    } catch (err) {
      console.error('Error fetching active attempt:', err);
      return null;
    }
  },

  /**
   * Get all attempts for a student on a specific exam (to check maxAttempts)
   */
  async getStudentAttempts(examId: string, studentId: string): Promise<ExamAttempt[]> {
    try {
      const q = query(
        collection(db, ATTEMPTS_COL),
        where('examId', '==', examId),
        where('studentId', '==', studentId)
      );
      const snapshot = await getDocs(q);
      const attempts = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ExamAttempt));
      // Sort by startedAt descending
      return attempts.sort((a, b) => {
        const aTime = a.startedAt?.toMillis ? a.startedAt.toMillis() : (a.startedAt ? new Date(a.startedAt).getTime() : 0);
        const bTime = b.startedAt?.toMillis ? b.startedAt.toMillis() : (b.startedAt ? new Date(b.startedAt).getTime() : 0);
        return bTime - aTime;
      });
    } catch (err) {
      console.error('Error fetching student attempts:', err);
      return [];
    }
  },

  /**
   * Get a specific attempt by ID
   */
  async getAttemptById(attemptId: string): Promise<ExamAttempt | null> {
    try {
      const docRef = doc(db, ATTEMPTS_COL, attemptId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { ...docSnap.data(), id: docSnap.id } as ExamAttempt;
      }
      return null;
    } catch (err) {
      console.error('Error getting attempt by ID:', err);
      return null;
    }
  },

  /**
   * Create a new attempt in Firestore.
   * If an active attempt already exists, return that instead of creating a duplicate!
   */
  async createAttempt(exam: ExamPackage, user: UserProfile): Promise<string> {
    // 1. Double check if active attempt already exists
    const existing = await this.getActiveAttempt(exam.id, user.uid);
    if (existing) {
      return existing.id;
    }

    const docRef = doc(collection(db, ATTEMPTS_COL));
    const durationSeconds = (exam.durationMinutes || 60) * 60;
    
    const attempt: Omit<ExamAttempt, 'id'> = {
      examId: exam.id,
      studentId: user.uid,
      studentName: user.displayName || user.name || user.username,
      subjectId: exam.subject,
      status: 'in_progress',
      answers: {},
      startedAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      lastSavedAt: serverTimestamp(),
      durationSeconds,
      remainingSeconds: durationSeconds,
      currentQuestionIndex: 0,
      answeredCount: 0,
      markedCount: 0,
    };

    await setDoc(docRef, attempt);
    return docRef.id;
  },

  /**
   * Save a single answer to Firestore (both document field and answers subcollection)
   */
  async saveAnswer(
    attemptId: string, 
    questionId: string, 
    option: 'A' | 'B' | 'C' | 'D' | '', 
    isMarked: boolean,
    timeSpent: number,
    currentQuestionIndex?: number
  ): Promise<void> {
    const docRef = doc(db, ATTEMPTS_COL, attemptId);
    const now = serverTimestamp();
    
    const answer: QuestionAnswer = {
      questionId,
      selectedOption: option,
      isMarked: !!isMarked,
      timeSpentSeconds: timeSpent,
      updatedAt: now,
    };

    const updatePayload: Record<string, any> = {
      [`answers.${questionId}`]: answer,
      lastActiveAt: now,
      lastSavedAt: now,
    };

    if (typeof currentQuestionIndex === 'number') {
      updatePayload.currentQuestionIndex = currentQuestionIndex;
    }

    // 1. Update master document
    await updateDoc(docRef, updatePayload);

    // 2. Also write to subcollection answers/{questionId} for high fidelity
    try {
      const answerSubDocRef = doc(db, ATTEMPTS_COL, attemptId, 'answers', questionId);
      await setDoc(answerSubDocRef, answer, { merge: true });
    } catch (subErr) {
      // Subcollection write failure is non-fatal since master doc has it
      console.warn('Subcollection write note:', subErr);
    }
  },

  /**
   * Update question index navigation progress
   */
  async updateQuestionIndex(attemptId: string, index: number): Promise<void> {
    const docRef = doc(db, ATTEMPTS_COL, attemptId);
    await updateDoc(docRef, {
      currentQuestionIndex: index,
      lastActiveAt: serverTimestamp(),
    });
  },

  /**
   * Submit attempt (manual or timeout)
   */
  async submitAttempt(attemptId: string, reason: 'manual' | 'timeout' = 'manual'): Promise<void> {
    const docRef = doc(db, ATTEMPTS_COL, attemptId);
    await updateDoc(docRef, {
      status: reason === 'timeout' ? 'timeout' : 'submitted',
      submissionReason: reason,
      submittedAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    });
  }
};
