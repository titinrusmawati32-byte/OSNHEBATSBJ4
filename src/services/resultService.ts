import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
  limit,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AttemptResult, QuestionResult } from '../types/result';
import { ExamAttempt } from '../types/attempt';
import { Question } from '../types/question';
import { ExamPackage } from '../types/exam';
import { getUserProfile } from './userService';

const RESULTS_COL = 'attemptResults';

const SUBJECT_NAME_MAP: Record<string, string> = {
  ipa: 'IPA (Sains)',
  ips: 'IPS (Sosial)',
  matematika: 'Matematika',
  bahasa_inggris: 'Bahasa Inggris',
};

export const resultService = {
  /**
   * Securely grade an attempt and save the final result to Firestore.
   * Ensures idempotency: setDoc using attemptId prevents duplicate creation if clicked multiple times.
   */
  async gradeAttempt(attemptId: string): Promise<AttemptResult> {
    // 1. Fetch Attempt
    const attemptSnap = await getDoc(doc(db, 'attempts', attemptId));
    if (!attemptSnap.exists()) throw new Error('Attempt not found');
    const attempt = { id: attemptSnap.id, ...attemptSnap.data() } as ExamAttempt;

    // 2. Fetch Exam Metadata
    const examSnap = await getDoc(doc(db, 'exams', attempt.examId));
    if (!examSnap.exists()) throw new Error('Exam not found');
    const exam = { id: examSnap.id, ...examSnap.data() } as ExamPackage;

    // 3. Fetch Student Profile for Class info & Teacher linkage
    const studentUser = await getUserProfile(attempt.studentId);
    const studentClass =
      studentUser?.className || studentUser?.grade || (attempt as any).studentClass || 'Kelas 5 SD';

    // Determine Teacher / Mentor
    const teacherId = exam.createdBy || (studentUser as any)?.teacherId || '';
    let teacherName = exam.teacherName || '';
    if (!teacherName && teacherId) {
      const teacherUser = await getUserProfile(teacherId);
      teacherName = teacherUser?.displayName || teacherUser?.name || 'Guru Pembina';
    }
    if (!teacherName) {
      teacherName = 'Guru Pembina';
    }

    // 4. Fetch all questions in this exam to get correct answers
    const questionIds = exam.questionIds || [];
    const questions: Question[] = [];

    // Firestore 'in' query limit is 30
    for (let i = 0; i < questionIds.length; i += 30) {
      const chunk = questionIds.slice(i, i + 30);
      if (chunk.length === 0) continue;
      const qQuery = query(collection(db, 'questions'), where('__name__', 'in', chunk));
      const qSnap = await getDocs(qQuery);
      qSnap.forEach((d) => questions.push({ id: d.id, ...d.data() } as Question));
    }

    // 5. Calculate Scores
    let correctCount = 0;
    let wrongCount = 0;
    let answeredCount = 0;
    let totalTimeSpent = 0;

    const questionResults: QuestionResult[] = questions.map((q, idx) => {
      const userAnswer = attempt.answers?.[q.id];
      const isAnswered = Boolean(userAnswer && userAnswer.selectedOption && (userAnswer.selectedOption as string) !== '');
      const isCorrect = Boolean(isAnswered && userAnswer?.selectedOption === q.correctAnswer);
      const timeSpent = userAnswer?.timeSpentSeconds || 0;

      if (isAnswered) {
        answeredCount++;
        if (isCorrect) correctCount++;
        else wrongCount++;
      }

      totalTimeSpent += timeSpent;

      return {
        questionId: q.id,
        questionNumber: q.questionNumber || idx + 1,
        selectedOption: (userAnswer?.selectedOption as any) || '',
        isAnswered,
        isCorrect,
        timeSpentSeconds: timeSpent,
        subjectId: q.subjectId,
        difficulty: q.difficulty as any,
      };
    });

    const totalQuestions = questions.length || exam.questionIds?.length || 0;
    const unansweredCount = Math.max(0, totalQuestions - answeredCount);
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const passed = score >= (exam.settings?.passingScore || 60);

    const submittedAt = attempt.submittedAt || serverTimestamp();
    const duration =
      attempt.submittedAt && attempt.startedAt
        ? Math.max(0, (new Date(attempt.submittedAt).getTime() - new Date(attempt.startedAt).getTime()) / 1000)
        : totalTimeSpent;

    const subjectName = SUBJECT_NAME_MAP[exam.subject] || exam.subject.toUpperCase();

    const result: Omit<AttemptResult, 'id'> = {
      attemptId: attempt.id,
      examId: attempt.examId,
      studentId: attempt.studentId,
      studentName: attempt.studentName || studentUser?.displayName || studentUser?.name || 'Siswa',
      studentClass: studentClass,
      teacherId: teacherId,
      teacherName: teacherName,
      examTitle: exam.title,
      subjectId: exam.subject,
      subjectName: subjectName,
      totalQuestions,
      answeredCount,
      unansweredCount,
      correctCount,
      wrongCount,
      score,
      percentage: score,
      passed,
      status: 'SELESAI',
      durationSeconds: Math.round(duration),
      averageTimePerQuestion: totalQuestions > 0 ? Math.round(duration / totalQuestions) : 0,
      startedAt: attempt.startedAt || serverTimestamp(),
      submittedAt: submittedAt,
      completedAt: submittedAt,
      gradedAt: serverTimestamp(),
      createdAt: attempt.startedAt || serverTimestamp(),
    };

    // 6. Save Result (SetDoc with attemptId avoids duplicates)
    const resultDocRef = doc(db, RESULTS_COL, attemptId);
    const batch = writeBatch(db);

    batch.set(resultDocRef, result, { merge: true });

    // Save question results in subcollection
    const qResCol = collection(db, RESULTS_COL, attemptId, 'questionResults');
    questionResults.forEach((qr) => {
      const qrRef = doc(qResCol, qr.questionId);
      batch.set(qrRef, qr, { merge: true });
    });

    // Update attempt status
    batch.update(doc(db, 'attempts', attemptId), { status: 'graded' });

    await batch.commit();

    return { id: attemptId, ...result } as AttemptResult;
  },

  /**
   * Get exam results for a specific student
   */
  async getStudentResults(studentId: string): Promise<AttemptResult[]> {
    try {
      const q = query(
        collection(db, RESULTS_COL),
        where('studentId', '==', studentId)
      );
      const snap = await getDocs(q);
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttemptResult));

      return results.sort((a, b) => {
        const timeA = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : new Date(a.submittedAt || a.createdAt || 0).getTime();
        const timeB = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : new Date(b.submittedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    } catch (err) {
      console.error('Error fetching student results:', err);
      return [];
    }
  },

  /**
   * Get exam results for a specific teacher (assigned students or created exams)
   */
  async getTeacherResults(teacherId: string): Promise<AttemptResult[]> {
    try {
      // Fetch all results, then filter for teacher's created exams or assigned students
      const allResultsSnap = await getDocs(collection(db, RESULTS_COL));
      const allResults = allResultsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as AttemptResult));

      const filtered = allResults.filter((r) => {
        return r.teacherId === teacherId || !r.teacherId; // Teacher sees own assigned/created results or unassigned in system
      });

      return filtered.sort((a, b) => {
        const timeA = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : new Date(a.submittedAt || a.createdAt || 0).getTime();
        const timeB = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : new Date(b.submittedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    } catch (err) {
      console.error('Error fetching teacher results:', err);
      return [];
    }
  },

  /**
   * Get result by ID
   */
  async getResultById(resultId: string): Promise<AttemptResult | null> {
    try {
      const snap = await getDoc(doc(db, RESULTS_COL, resultId));
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() } as AttemptResult;
      }
      return null;
    } catch (err) {
      console.error('Error getting result by ID:', err);
      return null;
    }
  },

  /**
   * Get question level results
   */
  async getQuestionResults(resultId: string): Promise<QuestionResult[]> {
    try {
      const q = query(
        collection(db, RESULTS_COL, resultId, 'questionResults'),
        orderBy('questionNumber', 'asc')
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as QuestionResult);
    } catch (err) {
      console.error('Error getting question results:', err);
      return [];
    }
  },

  /**
   * Get results for an exam
   */
  async getResultsByExam(examId: string): Promise<AttemptResult[]> {
    try {
      const q = query(
        collection(db, RESULTS_COL),
        where('examId', '==', examId)
      );
      const snap = await getDocs(q);
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttemptResult));
      return results.sort((a, b) => {
        const timeA = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : new Date(a.submittedAt || 0).getTime();
        const timeB = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : new Date(b.submittedAt || 0).getTime();
        return timeB - timeA;
      });
    } catch (err) {
      console.error('Error getting results by exam:', err);
      return [];
    }
  },

  /**
   * Get all results for Admin
   */
  async getAllResults(limitCount: number = 200): Promise<AttemptResult[]> {
    try {
      const q = query(collection(db, RESULTS_COL), limit(limitCount));
      const snap = await getDocs(q);
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AttemptResult));
      return results.sort((a, b) => {
        const timeA = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : new Date(a.submittedAt || 0).getTime();
        const timeB = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : new Date(b.submittedAt || 0).getTime();
        return timeB - timeA;
      });
    } catch (err) {
      console.error('Error getting all results:', err);
      return [];
    }
  },
};
