import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { 
  Search, 
  Layers, 
  Clock, 
  Play, 
  Sparkles, 
  BookOpen, 
  CheckCircle2, 
  Award, 
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  ChevronRight,
  Info
} from 'lucide-react';
import { examService } from '../../services/examService';
import { attemptService } from '../../services/attemptService';
import { ExamPackage } from '../../types/exam';
import { ExamAttempt } from '../../types/attempt';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

export const StudentExamsPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [exams, setExams] = useState<ExamPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');

  // Attempt Status Map: examId -> { activeAttempt?: ExamAttempt, lastAttempt?: ExamAttempt, totalAttempts: number }
  const [examAttemptsMap, setExamAttemptsMap] = useState<Record<string, {
    activeAttempt?: ExamAttempt;
    lastAttempt?: ExamAttempt;
    totalAttempts: number;
  }>>({});

  // Detail Modal State
  const [selectedExam, setSelectedExam] = useState<ExamPackage | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isStartingAttempt, setIsStartingAttempt] = useState(false);

  // 1. Fetch Active Exams and Student Attempt Statuses
  const loadExamsAndAttempts = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    try {
      const data = await examService.getAllExams();
      
      // Filter exams: Only active exams, and check target if configured
      const activeExams = data.filter((e) => {
        if (e.status !== 'active') return false;

        // Target check
        const target = (e as any).target;
        if (target && target.type) {
          if (target.type === 'students' && Array.isArray(target.studentIds)) {
            return target.studentIds.includes(profile.uid);
          }
          if (target.type === 'class' && Array.isArray(target.gradeIds)) {
            const studentGrade = profile.className || profile.grade || '';
            return target.gradeIds.some((g: string) => studentGrade.toLowerCase().includes(g.toLowerCase()));
          }
        }
        return true;
      });

      setExams(activeExams);

      // Fetch student's attempt records for each exam
      const attemptsInfo: Record<string, {
        activeAttempt?: ExamAttempt;
        lastAttempt?: ExamAttempt;
        totalAttempts: number;
      }> = {};

      await Promise.all(
        activeExams.map(async (exam) => {
          const studentAttempts = await attemptService.getStudentAttempts(exam.id, profile.uid);
          const active = studentAttempts.find(a => a.status === 'in_progress' || a.status === 'active');
          const last = studentAttempts[0]; // Sorted by newest first

          attemptsInfo[exam.id] = {
            activeAttempt: active,
            lastAttempt: last,
            totalAttempts: studentAttempts.length,
          };
        })
      );

      setExamAttemptsMap(attemptsInfo);
    } catch (err) {
      console.error('Failed to load exams:', err);
      showToast('Gagal memuat daftar ujian.', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile, showToast]);

  useEffect(() => {
    loadExamsAndAttempts();
  }, [loadExamsAndAttempts]);

  // Handle Card Action Click
  const handleExamAction = (exam: ExamPackage) => {
    const attemptInfo = examAttemptsMap[exam.id];

    // If student already has an active attempt, resume it immediately!
    if (attemptInfo?.activeAttempt) {
      navigate(`/student/exams/${exam.id}/attempt/${attemptInfo.activeAttempt.id}`);
      return;
    }

    // If max attempts reached and student has completed attempt, view results
    const maxAttempts = exam.settings?.maxAttempts || 1;
    if (attemptInfo && attemptInfo.totalAttempts >= maxAttempts && attemptInfo.lastAttempt) {
      navigate(`/student/results/${attemptInfo.lastAttempt.id}`);
      return;
    }

    // Otherwise, open Exam Details Modal for student to review before starting
    setSelectedExam(exam);
  };

  // Start Exam Handler (Confirm dialog -> Create Attempt -> Navigate to CBT)
  const handleConfirmStartExam = async () => {
    if (!selectedExam || !profile) return;
    setIsStartingAttempt(true);

    try {
      // 1. Create or retrieve active attempt
      const attemptId = await attemptService.createAttempt(selectedExam, profile);

      setShowConfirmModal(false);
      setSelectedExam(null);

      // 2. Navigate straight into CBT Attempt Page (NOT results!)
      navigate(`/student/exams/${selectedExam.id}/attempt/${attemptId}`);
    } catch (err: any) {
      console.error('Failed to start exam attempt:', err);
      showToast('Gagal memulai ujian. Silakan coba kembali.', 'error');
    } finally {
      setIsStartingAttempt(false);
    }
  };

  const filteredExams = exams.filter((exam) => {
    if (subjectFilter !== 'all' && exam.subject !== subjectFilter) return false;
    if (search.trim()) {
      return exam.title.toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  return (
    <div className="space-y-6 text-left pb-12 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Ujian Saya
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Paket ujian pembinaan olimpiade SD aktif yang ditugaskan kepada Anda.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari ujian..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 font-bold text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-hidden"
          >
            <option value="all">Semua Bidang</option>
            <option value="ipa">IPA</option>
            <option value="ips">IPS</option>
            <option value="matematika">MATEMATIKA</option>
            <option value="bahasa_inggris">B. INGGRIS</option>
          </select>
        </div>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div className="py-20 text-center text-xs text-slate-400">
          Memuat paket ujian dari server...
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800">
            <Layers className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Belum Ada Ujian
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Belum ada paket ujian yang diberikan kepada Anda saat ini. Silakan periksa kembali beberapa saat lagi atau hubungi guru pembina.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredExams.map((exam) => {
            const info = examAttemptsMap[exam.id];
            const maxAttempts = exam.settings?.maxAttempts || 1;
            const hasActiveAttempt = !!info?.activeAttempt;
            const isCompleted = info && info.totalAttempts >= maxAttempts && !hasActiveAttempt;

            return (
              <div
                key={exam.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4 flex flex-col justify-between hover:border-blue-500/50 transition-all group"
              >
                <div className="space-y-3">
                  {/* Subject Badge & Status Badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {exam.subject.toUpperCase()}
                    </span>

                    {hasActiveAttempt ? (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 animate-pulse">
                        Sedang Dikerjakan
                      </span>
                    ) : isCompleted ? (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                        Sudah Dikerjakan
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        {exam.category || 'Pembinaan'}
                      </span>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div className="space-y-1">
                    <h3 className="font-black text-slate-900 dark:text-slate-100 text-base leading-tight group-hover:text-blue-600 transition-colors">
                      {exam.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {exam.description || 'Simulasi pembinaan olimpiade tingkat SD terstruktur.'}
                    </p>
                  </div>
                </div>

                {/* Specs: Soal & Durasi */}
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <Layers className="w-3.5 h-3.5 text-blue-600" />
                      <span>{exam.questionIds?.length || 0} Soal</span>
                    </div>
                    <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      <span>{exam.durationMinutes} Menit</span>
                    </div>
                  </div>

                  {/* Dynamic Action Button */}
                  {hasActiveAttempt ? (
                    <Button
                      variant="primary"
                      size="md"
                      fullWidth
                      onClick={() => handleExamAction(exam)}
                      leftIcon={<Play className="w-4 h-4 fill-current" />}
                      className="rounded-2xl text-xs font-black bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md shadow-blue-500/20"
                    >
                      LANJUTKAN UJIAN
                    </Button>
                  ) : isCompleted ? (
                    <Button
                      variant="outline"
                      size="md"
                      fullWidth
                      onClick={() => handleExamAction(exam)}
                      leftIcon={<Award className="w-4 h-4 text-emerald-600" />}
                      className="rounded-2xl text-xs font-black text-emerald-600 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50"
                    >
                      LIHAT HASIL UJIAN
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="md"
                      fullWidth
                      onClick={() => handleExamAction(exam)}
                      rightIcon={<ChevronRight className="w-4 h-4" />}
                      className="rounded-2xl text-xs font-black"
                    >
                      MULAI UJIAN
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. Modal Detail Paket Ujian */}
      {selectedExam && (
        <Modal
          isOpen={!!selectedExam}
          onClose={() => setSelectedExam(null)}
          title="Detail Paket Ujian"
          size="lg"
        >
          <div className="space-y-5 text-left text-xs sm:text-sm">
            <div className="p-5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-600 text-white">
                  {selectedExam.subject.toUpperCase()}
                </span>
                <span className="text-xs text-slate-500 font-bold uppercase">
                  {selectedExam.category}
                </span>
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                {selectedExam.title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {selectedExam.description || 'Tidak ada petunjuk khusus untuk paket ujian ini.'}
              </p>
            </div>

            {/* Specification Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Jumlah Soal</span>
                <span className="text-base font-black text-slate-900 dark:text-slate-100">
                  {selectedExam.questionIds?.length || 0} Butir
                </span>
              </div>
              <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Durasi</span>
                <span className="text-base font-black text-slate-900 dark:text-slate-100">
                  {selectedExam.durationMinutes} Menit
                </span>
              </div>
              <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">Kesempatan</span>
                <span className="text-base font-black text-slate-900 dark:text-slate-100">
                  {selectedExam.settings?.maxAttempts || 1} Kali
                </span>
              </div>
              <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="block text-[10px] font-bold text-slate-400 uppercase">KKM / Lulus</span>
                <span className="text-base font-black text-slate-900 dark:text-slate-100">
                  {selectedExam.settings?.passingScore || 70}
                </span>
              </div>
            </div>

            {/* Exam Rules Card */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Aturan & Ketentuan Pengerjaan:
              </h4>
              <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 list-disc pl-4 leading-relaxed">
                <li>Waktu ujian akan langsung berjalan setelah tombol <strong>Mulai Sekarang</strong> ditekan.</li>
                <li>Jawaban Anda otomatis tersimpan ke server setiap kali Anda memilih pilihan jawaban.</li>
                <li>Jika browser tidak sengaja tertutup atau ter-refresh, Anda dapat melanjutkan kembali ujian dari soal terakhir.</li>
                <li>Pastikan koneksi internet Anda stabil sebelum menyelesaikan ujian.</li>
              </ul>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedExam(null)}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowConfirmModal(true)}
                leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
              >
                MULAI UJIAN
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 3. Konfirmasi Mulai Ujian Modal */}
      {selectedExam && (
        <Modal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          title="Siap Mengerjakan Ujian?"
          size="sm"
        >
          <div className="space-y-4 text-left text-xs sm:text-sm">
            <p className="text-slate-700 dark:text-slate-300">
              Anda akan memulai pengerjaan paket ujian:
            </p>

            <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 space-y-1">
              <h4 className="font-black text-slate-900 dark:text-slate-100 text-sm">
                {selectedExam.title}
              </h4>
              <div className="flex items-center gap-3 text-xs text-slate-500 font-bold">
                <span>{selectedExam.questionIds?.length || 0} Soal</span>
                <span>•</span>
                <span>Durasi: {selectedExam.durationMinutes} Menit</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-[11px] text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
              ⚠️ Setelah tombol <strong>Mulai Sekarang</strong> ditekan, timer ujian akan segera berjalan. Pastikan Anda siap.
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirmModal(false)}
                disabled={isStartingAttempt}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmStartExam}
                isLoading={isStartingAttempt}
                leftIcon={!isStartingAttempt ? <Play className="w-3.5 h-3.5 fill-current" /> : undefined}
              >
                {isStartingAttempt ? 'Memulai...' : 'Mulai Sekarang'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
