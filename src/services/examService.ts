import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ExamPackage, ExamStatus } from '../types/exam';
import { StudentQuestion } from '../types/attempt';

const EXAMS_COLLECTION = 'exams';
const QUESTIONS_COLLECTION = 'questions';

export const examService = {
  async getAllExams() {
    const q = query(collection(db, EXAMS_COLLECTION), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamPackage));
  },

  async getExamsByTeacher(teacherId: string) {
    const q = query(
      collection(db, EXAMS_COLLECTION), 
      where('createdBy', '==', teacherId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamPackage));
  },

  async getActiveExams() {
    const q = query(
      collection(db, EXAMS_COLLECTION),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamPackage));
  },

  async getExamById(id: string) {
    const docRef = doc(db, EXAMS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as ExamPackage;
    }
    return null;
  },

  async createExam(examData: Omit<ExamPackage, 'id' | 'createdAt' | 'updatedAt'>) {
    const docRef = await addDoc(collection(db, EXAMS_COLLECTION), {
      ...examData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  },

  async updateExam(id: string, examData: Partial<ExamPackage>) {
    const docRef = doc(db, EXAMS_COLLECTION, id);
    await updateDoc(docRef, {
      ...examData,
      updatedAt: serverTimestamp()
    });
  },

  async deleteExam(id: string) {
    const docRef = doc(db, EXAMS_COLLECTION, id);
    await deleteDoc(docRef);
  },

  async updateStatus(id: string, status: ExamStatus) {
    const docRef = doc(db, EXAMS_COLLECTION, id);
    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp()
    });
  },

  /**
   * Fetches questions for an exam in student mode.
   * STRICT SECURITY: Deliberately omits `correctAnswer` and `explanation`
   * so answer keys are never sent to the student client.
   */
  async getExamQuestionsForStudent(questionIds: string[]): Promise<StudentQuestion[]> {
    if (!questionIds || questionIds.length === 0) return [];
    
    const resultsMap = new Map<string, StudentQuestion>();

    // Chunk in batches of 30 for Firestore 'in' limitation
    for (let i = 0; i < questionIds.length; i += 30) {
      const chunk = questionIds.slice(i, i + 30);
      const q = query(collection(db, QUESTIONS_COLLECTION), where('__name__', 'in', chunk));
      const snapshot = await getDocs(q);
      
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        const options = d.options || {
          A: d.optionA || '',
          B: d.optionB || '',
          C: d.optionC || '',
          D: d.optionD || '',
        };

        const questionText = d.questionText || d.question || '';

        // Only sanitize safe student-facing fields
        resultsMap.set(docSnap.id, {
          id: docSnap.id,
          questionNumber: d.questionNumber || 0,
          questionText,
          options,
          imageUrl: d.imageUrl || undefined,
          imageAlt: d.imageAlt || undefined,
          difficulty: d.difficulty || 'medium',
        });
      });
    }

    // Preserve the original order defined in exam.questionIds
    const orderedQuestions: StudentQuestion[] = [];
    questionIds.forEach((qId, idx) => {
      const item = resultsMap.get(qId);
      if (item) {
        orderedQuestions.push({
          ...item,
          questionNumber: idx + 1, // 1-indexed presentation
        });
      }
    });

    return orderedQuestions;
  }
};
