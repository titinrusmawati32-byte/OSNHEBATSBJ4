import { 
  collection, 
  getDocs, 
  query, 
  where, 
  getCountFromServer 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface AdminStats {
  totalStudents: number;
  totalTeachers: number;
  totalQuestions: number;
  totalExams: number;
  activeExams: number;
}

export interface TeacherStats {
  totalQuestions: number;
  totalExams: number;
  activeExams: number;
  totalParticipants: number;
}

export interface StudentStats {
  examsTaken: number;
  averageScore: number;
  highestScore: number;
  currentRank: number;
}

/**
 * Helper to safely count documents in a query, falling back to getDocs if needed
 */
async function safeCount(q: any): Promise<number> {
  try {
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch {
    try {
      const snap = await getDocs(q);
      return snap.size;
    } catch {
      return 0;
    }
  }
}

export const statsService = {
  getAdminStats: async (): Promise<AdminStats> => {
    try {
      const studentQuery = query(collection(db, 'users'), where('role', '==', 'student'));
      const teacherQuery = query(collection(db, 'users'), where('role', '==', 'teacher'));
      const questionsCol = collection(db, 'questions');
      const examsCol = collection(db, 'exams');
      const activeExamsQuery = query(collection(db, 'exams'), where('status', '==', 'active'));

      const [
        totalStudents,
        totalTeachers,
        totalQuestions,
        totalExams,
        activeExams,
      ] = await Promise.all([
        safeCount(studentQuery),
        safeCount(teacherQuery),
        safeCount(questionsCol),
        safeCount(examsCol),
        safeCount(activeExamsQuery),
      ]);

      return {
        totalStudents,
        totalTeachers,
        totalQuestions,
        totalExams,
        activeExams,
      };
    } catch (error: any) {
      console.warn('Admin stats fetch notice:', error?.message || error);
      return {
        totalStudents: 0,
        totalTeachers: 0,
        totalQuestions: 0,
        totalExams: 0,
        activeExams: 0,
      };
    }
  },

  getTeacherStats: async (teacherId: string): Promise<TeacherStats> => {
    try {
      const questionsQuery = query(collection(db, 'questions'), where('createdBy', '==', teacherId));
      const examsQuery = query(collection(db, 'exams'), where('createdBy', '==', teacherId));
      const activeExamsQuery = query(
        collection(db, 'exams'),
        where('createdBy', '==', teacherId),
        where('status', '==', 'active')
      );

      const [totalQuestions, totalExams, activeExams] = await Promise.all([
        safeCount(questionsQuery),
        safeCount(examsQuery),
        safeCount(activeExamsQuery),
      ]);

      return {
        totalQuestions,
        totalExams,
        activeExams,
        totalParticipants: 0,
      };
    } catch (error: any) {
      console.warn('Teacher stats fetch notice:', error?.message || error);
      return {
        totalQuestions: 0,
        totalExams: 0,
        activeExams: 0,
        totalParticipants: 0,
      };
    }
  },

  getStudentStats: async (studentId: string): Promise<StudentStats> => {
    try {
      const attemptsSnap = await getDocs(query(collection(db, 'attempts'), where('studentId', '==', studentId), where('status', '==', 'completed')));
      const attempts = attemptsSnap.docs.map(d => d.data());
      
      const examsTaken = attempts.length;
      const totalScore = attempts.reduce((acc, curr) => acc + (curr.score || 0), 0);
      const averageScore = examsTaken > 0 ? Math.round(totalScore / examsTaken) : 0;
      const highestScore = attempts.reduce((acc, curr) => Math.max(acc, curr.score || 0), 0);
      
      // Rank calculation is complex, return 0 for now or fetch from a leaderboard
      const currentRank = 0;

      return {
        examsTaken,
        averageScore,
        highestScore,
        currentRank,
      };
    } catch (error) {
      console.error('Failed to fetch student stats:', error);
      return {
        examsTaken: 0,
        averageScore: 0,
        highestScore: 0,
        currentRank: 0,
      };
    }
  }
};
