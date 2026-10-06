import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { attemptService } from '../../services/attemptService';
import { examService } from '../../services/examService';
import { resultService } from '../../services/resultService';
import { ExamAttempt, QuestionAnswer, StudentQuestion } from '../../types/attempt';
import { ExamPackage } from '../../types/exam';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Flag,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Send,
  LayoutGrid,
  X,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';

export const ExamAttemptPage: React.FC = () => {
  const { examId, attemptId } = useParams<{ examId: string; attemptId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();

  // Core Data State
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamPackage | null>(null);
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuestionAnswer>>({});

  // UI State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showMobileNavigator, setShowMobileNavigator] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  // Question timer reference
  const questionStartTimeRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<any>(null);

  // 1. Initial Load: Fetch Exam, Attempt, and Questions from Firestore
  useEffect(() => {
    let isMounted = true;

    async function loadCBT() {
      if (!examId || !attemptId || !profile) return;
      setLoading(true);

      try {
        // Fetch Attempt
        const attemptData = await attemptService.getAttemptById(attemptId);
        if (!attemptData) {
          showToast('Sesi ujian tidak ditemukan.', 'error');
          navigate('/student/exams', { replace: true });
          return;
        }

        // Verify Student Ownership
        if (attemptData.studentId !== profile.uid) {
          showToast('Anda tidak memiliki akses ke sesi ujian ini.', 'error');
          navigate('/student/exams', { replace: true });
          return;
        }

        // If attempt is already submitted or timed out, send directly to results
        if (attemptData.status === 'submitted' || attemptData.status === 'timeout' || attemptData.status === 'graded') {
          navigate(`/student/results/${attemptId}`, { replace: true });
          return;
        }

        // Fetch Exam Metadata
        const examData = await examService.getExamById(examId);
        if (!examData) {
          showToast('Data paket ujian tidak ditemukan.', 'error');
          navigate('/student/exams', { replace: true });
          return;
        }

        // Fetch Sanitized Questions (NO correctAnswer)
        const studentQuestions = await examService.getExamQuestionsForStudent(examData.questionIds || []);
        if (studentQuestions.length === 0) {
          showToast('Paket ujian belum memiliki butir soal yang valid.', 'error');
          navigate('/student/exams', { replace: true });
          return;
        }

        if (!isMounted) return;

        setExam(examData);
        setAttempt(attemptData);
        setQuestions(studentQuestions);
        setAnswers(attemptData.answers || {});

        // Restore last question index if saved
        const restoredIndex = typeof attemptData.currentQuestionIndex === 'number'
          && attemptData.currentQuestionIndex >= 0
          && attemptData.currentQuestionIndex < studentQuestions.length
            ? attemptData.currentQuestionIndex
            : 0;
        setCurrentIndex(restoredIndex);

        // Calculate Remaining Timer from Server startedAt
        const startedMillis = attemptData.startedAt?.toMillis
          ? attemptData.startedAt.toMillis()
          : (attemptData.startedAt ? new Date(attemptData.startedAt).getTime() : Date.now());
        const totalDurationSecs = attemptData.durationSeconds || (examData.durationMinutes * 60);
        const endMillis = startedMillis + (totalDurationSecs * 1000);
        const remaining = Math.max(0, Math.floor((endMillis - Date.now()) / 1000));
        setRemainingSeconds(remaining);

        questionStartTimeRef.current = Date.now();
      } catch (err: any) {
        console.error('Failed to load CBT session:', err);
        showToast('Gagal memuat sesi ujian. Silakan coba lagi.', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadCBT();

    return () => {
      isMounted = false;
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [examId, attemptId, profile]);

  // Timer warning tracking (10m, 5m, 1m)
  const warnedTimesRef = useRef<Set<number>>(new Set());

  // 2. Timer Countdown Engine
  useEffect(() => {
    if (loading || isSubmitting || !attempt) return;

    timerIntervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          handleTimeOut();
          return 0;
        }

        const next = prev - 1;

        if (next === 600 && !warnedTimesRef.current.has(600)) {
          warnedTimesRef.current.add(600);
          showToast('Waktu ujian tersisa 10 menit.', 'info');
        } else if (next === 300 && !warnedTimesRef.current.has(300)) {
          warnedTimesRef.current.add(300);
          showToast('Waktu tersisa 5 menit. Segera periksa jawaban Anda.', 'warning');
        } else if (next === 60 && !warnedTimesRef.current.has(60)) {
          warnedTimesRef.current.add(60);
          showToast('Waktu tersisa 1 menit! Ujian akan otomatis dikumpulkan saat waktu habis.', 'warning');
        }

        return next;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [loading, isSubmitting, attempt]);

  // Handle Automatic Timeout Submission
  const handleTimeOut = useCallback(async () => {
    if (isSubmitting || !attemptId) return;
    setIsSubmitting(true);
    showToast('Waktu ujian telah berakhir! Menyimpan dan mengumpulkan jawaban...', 'warning');

    try {
      await attemptService.submitAttempt(attemptId, 'timeout');
      await resultService.gradeAttempt(attemptId);
      navigate(`/student/results/${attemptId}`, { replace: true });
    } catch (err) {
      console.error('Timeout submit error:', err);
      navigate(`/student/results/${attemptId}`, { replace: true });
    }
  }, [isSubmitting, attemptId, navigate, showToast]);

  // Current Question
  const currentQuestion = useMemo(() => {
    return questions[currentIndex] || null;
  }, [questions, currentIndex]);

  const currentAnswer = useMemo(() => {
    if (!currentQuestion) return null;
    return answers[currentQuestion.id] || null;
  }, [answers, currentQuestion]);

  // 3. Save Option Selection to Firestore
  const handleSelectOption = async (optionKey: 'A' | 'B' | 'C' | 'D') => {
    if (!currentQuestion || !attemptId || isSubmitting) return;

    const timeSpent = Math.max(1, Math.floor((Date.now() - questionStartTimeRef.current) / 1000));
    const previousTime = currentAnswer?.timeSpentSeconds || 0;
    const isCurrentlyMarked = currentAnswer?.isMarked || false;

    // Optimistic UI update
    const updatedAnswer: QuestionAnswer = {
      questionId: currentQuestion.id,
      selectedOption: optionKey,
      isMarked: isCurrentlyMarked,
      timeSpentSeconds: previousTime + timeSpent,
      updatedAt: new Date(),
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: updatedAnswer,
    }));

    setSaveStatus('saving');
    questionStartTimeRef.current = Date.now();

    try {
      await attemptService.saveAnswer(
        attemptId,
        currentQuestion.id,
        optionKey,
        isCurrentlyMarked,
        updatedAnswer.timeSpentSeconds,
        currentIndex
      );
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to save answer:', err);
      setSaveStatus('error');
      showToast('Gagal menyimpan jawaban. Sistem akan mencoba kembali.', 'error');
    }
  };

  // 4. Toggle Ragu-ragu (Marked)
  const handleToggleMark = async () => {
    if (!currentQuestion || !attemptId || isSubmitting) return;

    const newMarkedState = !currentAnswer?.isMarked;
    const timeSpent = Math.max(1, Math.floor((Date.now() - questionStartTimeRef.current) / 1000));
    const previousTime = currentAnswer?.timeSpentSeconds || 0;

    const updatedAnswer: QuestionAnswer = {
      questionId: currentQuestion.id,
      selectedOption: currentAnswer?.selectedOption || '',
      isMarked: newMarkedState,
      timeSpentSeconds: previousTime + timeSpent,
      updatedAt: new Date(),
    };

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: updatedAnswer,
    }));

    setSaveStatus('saving');
    try {
      await attemptService.saveAnswer(
        attemptId,
        currentQuestion.id,
        updatedAnswer.selectedOption,
        newMarkedState,
        updatedAnswer.timeSpentSeconds,
        currentIndex
      );
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to update mark:', err);
      setSaveStatus('error');
    }
  };

  // Navigation handlers
  const handleNavigateQuestion = (index: number) => {
    if (index < 0 || index >= questions.length) return;
    questionStartTimeRef.current = Date.now();
    setCurrentIndex(index);
    if (attemptId) {
      attemptService.updateQuestionIndex(attemptId, index).catch(() => {});
    }
  };

  // 5. Final Submission Handler
  const handleSubmitExam = async () => {
    if (!attemptId || isSubmitting) return;
    setIsSubmitting(true);
    setShowSubmitModal(false);
    showToast('Mengumpulkan ujian dan melakukan penilaian...', 'info');

    try {
      // 1. Submit Attempt
      await attemptService.submitAttempt(attemptId, 'manual');

      // 2. Grade Securely on Trusted Service
      await resultService.gradeAttempt(attemptId);

      showToast('Ujian berhasil dikumpulkan!', 'success');
      // 3. Navigate directly to Results
      navigate(`/student/results/${attemptId}`, { replace: true });
    } catch (err: any) {
      console.error('Failed to submit exam:', err);
      showToast('Gagal mengumpulkan ujian. Silakan coba kembali.', 'error');
      setIsSubmitting(false);
    }
  };

  // Format Timer Display
  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  // Summary counts
  const summaryCounts = useMemo(() => {
    let answered = 0;
    let marked = 0;
    questions.forEach((q) => {
      const a = answers[q.id];
      if (a && a.selectedOption) answered++;
      if (a && a.isMarked) marked++;
    });
    return {
      answered,
      marked,
      unanswered: Math.max(0, questions.length - answered),
    };
  }, [questions, answers]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 space-y-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
          Mempersiapkan Lembar Ujian CBT...
        </h3>
        <p className="text-xs text-slate-400">Menghubungkan ke server dan menyusun lembar jawaban Anda.</p>
      </div>
    );
  }

  if (!exam || questions.length === 0 || !currentQuestion) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
        <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
          Soal Ujian Tidak Dapat Dimuat
        </h3>
        <p className="text-xs text-slate-500 max-w-md">
          Paket ujian ini belum memiliki butir soal yang valid atau sesi telah kadaluwarsa.
        </p>
        <Button variant="primary" size="sm" onClick={() => navigate('/student/exams')}>
          Kembali ke Ujian Saya
        </Button>
      </div>
    );
  }

  const isLowTime = remainingSeconds <= 300; // < 5 minutes
  const isCriticalTime = remainingSeconds <= 60; // < 1 minute

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col text-slate-900 dark:text-slate-100 selection:bg-blue-200">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Exam Title & Subject */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-black uppercase tracking-wider">
              {exam.subject.toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-black truncate max-w-[200px] sm:max-w-md">
                {exam.title}
              </h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase truncate">
                Peserta: {profile?.displayName || profile?.name}
              </p>
            </div>
          </div>

          {/* Center/Right: Timer & Autosave Status */}
          <div className="flex items-center gap-3">
            {/* Autosave Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold">
              {saveStatus === 'saving' && (
                <span className="text-amber-500 flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Tersimpan</span>
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-rose-500 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Belum tersimpan</span>
                </span>
              )}
            </div>

            {/* Countdown Timer Badge */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono font-black text-xs sm:text-sm tracking-wider transition-colors ${
                isCriticalTime
                  ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 border-rose-300 dark:border-rose-800 animate-pulse'
                  : isLowTime
                  ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-600 border-amber-300 dark:border-amber-800'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Clock className="w-4 h-4 text-blue-600" />
              <span>{formatTime(remainingSeconds)}</span>
            </div>

            {/* Mobile Palette Toggle */}
            <button
              onClick={() => setShowMobileNavigator(true)}
              className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition-colors"
              title="Daftar Soal"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>

            {/* Finish Button */}
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowSubmitModal(true)}
              disabled={isSubmitting}
              className="hidden sm:flex text-xs font-black shadow-xs"
            >
              SELESAI
            </Button>
          </div>
        </div>
      </header>

      {/* Main CBT Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Question & Options Canvas (Span 8) */}
        <div className="lg:col-span-8 flex flex-col space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-8 shadow-xs flex-1 flex flex-col space-y-6">
            {/* Question Card Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                  {currentIndex + 1}
                </span>
                <div>
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                    Soal {currentIndex + 1} dari {questions.length}
                  </span>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Tingkat: {currentQuestion.difficulty || 'Medium'}
                  </div>
                </div>
              </div>

              {/* Ragu-ragu / Mark Button */}
              <button
                type="button"
                onClick={handleToggleMark}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                  currentAnswer?.isMarked
                    ? 'bg-amber-500 border-amber-500 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-amber-400 hover:text-amber-600'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{currentAnswer?.isMarked ? 'Ditandai Ragu' : 'Tandai Ragu'}</span>
              </button>
            </div>

            {/* Question Text & Media */}
            <div className="space-y-4 flex-1">
              <div className="text-sm sm:text-base text-slate-800 dark:text-slate-100 font-semibold leading-relaxed whitespace-pre-line">
                {currentQuestion.questionText}
              </div>

              {/* Optional Question Image */}
              {currentQuestion.imageUrl && (
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 max-w-md bg-slate-50 dark:bg-slate-950">
                  <img
                    src={currentQuestion.imageUrl}
                    alt={currentQuestion.imageAlt || 'Ilustrasi Soal'}
                    className="w-full h-auto object-contain max-h-72"
                    loading="lazy"
                  />
                </div>
              )}
            </div>

            {/* Options Selection (A, B, C, D) */}
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Pilih salah satu jawaban:
              </div>

              {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                const optText = currentQuestion.options[optKey];
                const isSelected = currentAnswer?.selectedOption === optKey;

                return (
                  <button
                    key={optKey}
                    type="button"
                    onClick={() => handleSelectOption(optKey)}
                    className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-3.5 cursor-pointer select-none group ${
                      isSelected
                        ? 'bg-blue-50/80 dark:bg-blue-950/60 border-blue-600 text-blue-950 dark:text-blue-100 shadow-xs ring-1 ring-blue-600'
                        : 'bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-slate-50/50'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-700'
                      }`}
                    >
                      {optKey}
                    </div>

                    <div className="text-xs sm:text-sm font-medium leading-relaxed pt-0.5 flex-1">
                      {optText || <span className="text-slate-400 italic">Pilihan {optKey}</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bottom Question Navigation Controls */}
            <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                size="md"
                onClick={() => handleNavigateQuestion(currentIndex - 1)}
                disabled={currentIndex === 0 || (exam?.settings as any)?.allowBackNavigation === false}
                leftIcon={<ChevronLeft className="w-4 h-4" />}
                className="rounded-2xl text-xs font-bold"
                title={(exam?.settings as any)?.allowBackNavigation === false ? 'Kembali ke soal sebelumnya tidak diizinkan pada ujian ini' : undefined}
              >
                Sebelumnya
              </Button>

              <div className="text-[11px] font-bold text-slate-400 sm:hidden">
                {currentIndex + 1} / {questions.length}
              </div>

              {currentIndex < questions.length - 1 ? (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handleNavigateQuestion(currentIndex + 1)}
                  rightIcon={<ChevronRight className="w-4 h-4" />}
                  className="rounded-2xl text-xs font-bold"
                >
                  Berikutnya
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="md"
                  onClick={() => setShowSubmitModal(true)}
                  rightIcon={<Send className="w-4 h-4" />}
                  className="rounded-2xl text-xs font-bold shadow-md shadow-rose-600/20"
                >
                  Selesaikan Ujian
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Desktop Question Palette Navigator (Span 4) */}
        <div className="hidden lg:block lg:col-span-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs sticky top-20 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Navigasi Soal
                </h3>
                <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                  Klik nomor untuk berpindah soal
                </p>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                {summaryCounts.answered} / {questions.length} Selesai
              </span>
            </div>

            {/* Status Legend */}
            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-wider pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-md bg-emerald-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">Terjawab ({summaryCounts.answered})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-md bg-amber-500 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">Ragu ({summaryCounts.marked})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-md bg-slate-200 dark:bg-slate-700 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">Belum ({summaryCounts.unanswered})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-md border-2 border-blue-600 shrink-0" />
                <span className="text-slate-600 dark:text-slate-400">Sedang Dibuka</span>
              </div>
            </div>

            {/* Question Numbers Grid */}
            <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1">
              {questions.map((q, idx) => {
                const ans = answers[q.id];
                const isCurrent = idx === currentIndex;
                const isAnswered = ans && !!ans.selectedOption;
                const isMarked = ans && !!ans.isMarked;

                let btnStyle = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
                if (isMarked) {
                  btnStyle = 'bg-amber-500 text-white border-amber-500 font-black shadow-xs';
                } else if (isAnswered) {
                  btnStyle = 'bg-emerald-600 text-white border-emerald-600 font-black shadow-xs';
                }

                if (isCurrent) {
                  btnStyle += ' ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-slate-900';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handleNavigateQuestion(idx)}
                    className={`h-10 rounded-xl border text-xs font-bold transition-all flex items-center justify-center relative cursor-pointer hover:scale-105 active:scale-95 ${btnStyle}`}
                  >
                    {idx + 1}
                    {isMarked && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="danger"
                size="md"
                fullWidth
                onClick={() => setShowSubmitModal(true)}
                isLoading={isSubmitting}
                className="rounded-2xl text-xs font-black shadow-lg shadow-rose-600/20"
              >
                KUMPULKAN UJIAN
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Drawer / Bottom Sheet Question Palette */}
      {showMobileNavigator && (
        <div className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl p-6 max-h-[80vh] flex flex-col space-y-4 border-t border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black">Navigasi Soal</h3>
                <span className="text-xs text-slate-400 font-bold">
                  {summaryCounts.answered} dari {questions.length} telah dijawab
                </span>
              </div>
              <button
                onClick={() => setShowMobileNavigator(false)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2.5 overflow-y-auto max-h-60 p-1">
              {questions.map((q, idx) => {
                const ans = answers[q.id];
                const isCurrent = idx === currentIndex;
                const isAnswered = ans && !!ans.selectedOption;
                const isMarked = ans && !!ans.isMarked;

                let btnStyle = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
                if (isMarked) {
                  btnStyle = 'bg-amber-500 text-white font-black';
                } else if (isAnswered) {
                  btnStyle = 'bg-emerald-600 text-white font-black';
                }

                if (isCurrent) {
                  btnStyle += ' ring-2 ring-blue-600 ring-offset-2';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      handleNavigateQuestion(idx);
                      setShowMobileNavigator(false);
                    }}
                    className={`h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center ${btnStyle}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <Button
              variant="danger"
              size="md"
              fullWidth
              onClick={() => {
                setShowMobileNavigator(false);
                setShowSubmitModal(true);
              }}
              className="mt-2 text-xs font-black"
            >
              SELESAIKAN UJIAN
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation Modal to Submit Exam */}
      <Modal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        title="Kumpulkan Ujian Sekarang?"
        size="md"
      >
        <div className="space-y-5 text-left text-xs sm:text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            Periksa kembali rangkuman pengerjaan Anda sebelum mengumpulkan:
          </p>

          {/* Answer Status Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-center">
              <span className="block text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">
                Terjawab
              </span>
              <span className="text-xl font-black text-emerald-800 dark:text-emerald-300">
                {summaryCounts.answered}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-center">
              <span className="block text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">
                Ragu-ragu
              </span>
              <span className="text-xl font-black text-amber-800 dark:text-amber-300">
                {summaryCounts.marked}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 text-center">
              <span className="block text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase">
                Belum Dijawab
              </span>
              <span className="text-xl font-black text-rose-800 dark:text-rose-300">
                {summaryCounts.unanswered}
              </span>
            </div>
          </div>

          {summaryCounts.unanswered > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                Perhatian: Masih ada <strong>{summaryCounts.unanswered} soal</strong> yang belum Anda jawab.
              </span>
            </div>
          )}

          <p className="text-[11px] text-slate-500">
            Setelah dikumpulkan, jawaban akan dinilai secara otomatis dan Anda tidak dapat mengubah jawaban lagi.
          </p>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSubmitModal(false)}
              disabled={isSubmitting}
            >
              Kembali Periksa
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleSubmitExam}
              isLoading={isSubmitting}
              leftIcon={!isSubmitting ? <Send className="w-3.5 h-3.5" /> : undefined}
            >
              {isSubmitting ? 'Mengumpulkan...' : 'Ya, Kumpulkan Ujian'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
