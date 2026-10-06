export type AttemptStatus = 
  | 'not_started' 
  | 'in_progress' 
  | 'active' 
  | 'submitted' 
  | 'timeout' 
  | 'cancelled' 
  | 'graded';

export interface QuestionAnswer {
  questionId: string;
  selectedOption: 'A' | 'B' | 'C' | 'D' | '';
  isMarked: boolean;
  timeSpentSeconds: number;
  answeredAt?: any;
  updatedAt?: any;
}

export interface ExamAttempt {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  subjectId: string;
  status: AttemptStatus;
  answers: Record<string, QuestionAnswer>; // questionId -> answer
  startedAt: any;
  lastActiveAt: any;
  lastSavedAt?: any;
  submittedAt?: any;
  durationSeconds: number;
  remainingSeconds: number;
  currentQuestionIndex: number;
  answeredCount: number;
  markedCount: number;
  submissionReason?: 'manual' | 'timeout';
}

export interface StudentQuestion {
  id: string;
  questionNumber: number;
  questionText: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  imageUrl?: string;
  imageAlt?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}
