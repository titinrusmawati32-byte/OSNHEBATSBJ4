import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import { resultService } from '../../services/resultService';
import { examService } from '../../services/examService';
import { getTeachers } from '../../services/userService';
import { AttemptResult } from '../../types/result';
import { ExamPackage } from '../../types/exam';
import { UserProfile } from '../../types/auth';
import { Button } from '../../components/ui/Button';
import { 
  BarChart3, 
  Search, 
  Filter, 
  Download, 
  Users,
  Layers,
  Activity,
  Globe,
  Trophy,
  Award,
  ArrowRight,
  UserCheck
} from 'lucide-react';

export const AdminResultsPage: React.FC = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [results, setResults] = useState<AttemptResult[]>([]);
  const [exams, setExams] = useState<ExamPackage[]>([]);
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [teacherFilter, setTeacherFilter] = useState('all');
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [examFilter, setExamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Sorting
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'score_desc' | 'score_asc' | 'student_asc'>('date_desc');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [resultsData, examsData, teachersData] = await Promise.all([
          resultService.getAllResults(500),
          examService.getAllExams(),
          getTeachers(),
        ]);
        setResults(resultsData);
        setExams(examsData);
        setTeachers(teachersData);
      } catch (err) {
        console.error(err);
        showToast('Gagal memuat rekap nilai sistem.', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const uniqueClasses = Array.from(new Set(results.map((r) => r.studentClass).filter(Boolean)));

  // Filter logic
  const filteredResults = results.filter((r) => {
    // Search student name, exam title, or teacher
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = r.studentName?.toLowerCase().includes(q);
      const matchExam = r.examTitle?.toLowerCase().includes(q);
      const matchTeacher = r.teacherName?.toLowerCase().includes(q);
      if (!matchName && !matchExam && !matchTeacher) return false;
    }

    if (classFilter !== 'all' && r.studentClass !== classFilter) return false;
    if (teacherFilter !== 'all' && r.teacherId !== teacherFilter) return false;
    if (subjectFilter !== 'all' && r.subjectId !== subjectFilter) return false;
    if (examFilter !== 'all' && r.examId !== examFilter) return false;
    if (statusFilter !== 'all' && (r.status || 'SELESAI') !== statusFilter) return false;

    return true;
  });

  // Sort logic
  const sortedResults = [...filteredResults].sort((a, b) => {
    if (sortBy === 'score_desc') return b.score - a.score;
    if (sortBy === 'score_asc') return a.score - b.score;
    if (sortBy === 'student_asc') return (a.studentName || '').localeCompare(b.studentName || '');

    const timeA = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : new Date(a.submittedAt || a.createdAt || 0).getTime();
    const timeB = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : new Date(b.submittedAt || b.createdAt || 0).getTime();

    if (sortBy === 'date_asc') return timeA - timeB;
    return timeB - timeA;
  });

  // Summary Statistics
  const totalParticipants = new Set(filteredResults.map((r) => r.studentId)).size;
  const scores = filteredResults.map((r) => r.score);
  const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
  const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const getSubjectBadge = (subId: string) => {
    const map: Record<string, { label: string; color: string }> = {
      ipa: { label: 'IPA', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      ips: { label: 'IPS', color: 'bg-orange-50 text-orange-700 border-orange-200' },
      matematika: { label: 'MATEMATIKA', color: 'bg-purple-50 text-purple-700 border-purple-200' },
      bahasa_inggris: { label: 'B. INGGRIS', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    };
    const s = map[subId] || { label: subId.toUpperCase(), color: 'bg-slate-50 text-slate-700 border-slate-200' };
    return (
      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${s.color}`}>
        {s.label}
      </span>
    );
  };

  const formatDate = (dateVal: any) => {
    if (!dateVal) return '-';
    const dateObj = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(dateObj.getTime())) return '-';
    return dateObj.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6 text-left pb-12">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 text-white">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-black uppercase tracking-wider mb-2">
            <Globe className="w-3.5 h-3.5" />
            <span>Sistem Monitoring Rekapitulasi Global</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            Rekap Nilai Ujian Seluruh Siswa
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Akses penuh rekapitulasi nilai seluruh peserta olimpiade, analisis per bidang, serta performa per guru pembina.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => showToast('Ekspor data masal sedang diproses...', 'info')}
          leftIcon={<Download className="w-4 h-4" />}
          className="shrink-0 w-full sm:w-auto bg-blue-600 hover:bg-blue-700 border-none"
        >
          REKAP SELURUH DATA (.CSV)
        </Button>
      </div>

      {/* Statistics Badges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Peserta', value: totalParticipants, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'Rata-rata Nilai', value: averageScore, icon: BarChart3, color: 'text-emerald-500', bg: 'bg-emerald-50' },
          { label: 'Nilai Tertinggi', value: highestScore, icon: Trophy, color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: 'Nilai Terendah', value: lowestScore, icon: Award, color: 'text-rose-500', bg: 'bg-rose-50' },
        ].map((s, i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg} dark:bg-opacity-10 ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{s.label}</div>
                <div className="text-xl font-black text-slate-900 dark:text-slate-100">{s.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="sm:col-span-2 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama siswa, ujian, atau guru..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-600 font-medium"
            />
          </div>

          {/* Filter Kelas */}
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-700 dark:text-slate-200"
          >
            <option value="all">Semua Kelas</option>
            {uniqueClasses.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </select>

          {/* Filter Guru Pembina */}
          <select
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-700 dark:text-slate-200"
          >
            <option value="all">Semua Guru Pembina</option>
            {teachers.map((t) => (
              <option key={t.uid} value={t.uid}>
                {t.displayName || t.name}
              </option>
            ))}
          </select>

          {/* Filter Bidang */}
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-700 dark:text-slate-200"
          >
            <option value="all">Semua Bidang</option>
            <option value="ipa">IPA (Sains)</option>
            <option value="ips">IPS (Sosial)</option>
            <option value="matematika">Matematika</option>
            <option value="bahasa_inggris">B. Inggris</option>
          </select>

          {/* Filter Paket Ujian */}
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 font-bold text-slate-700 dark:text-slate-200"
          >
            <option value="all">Semua Paket Ujian</option>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Admin Table */}
      {loading ? (
        <div className="py-20 text-center text-xs text-slate-400">Memuat seluruh data rekapitulasi...</div>
      ) : sortedResults.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-4 shadow-xs">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800">
            <BarChart3 className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Belum ada data nilai
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Hasil pengerjaan ujian dari seluruh siswa akan terhimpun otomatis di sini.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">No</th>
                  <th className="px-4 py-3.5">Siswa</th>
                  <th className="px-4 py-3.5">Kelas</th>
                  <th className="px-4 py-3.5">Guru Pembina</th>
                  <th className="px-4 py-3.5">Bidang</th>
                  <th className="px-4 py-3.5">Paket Ujian</th>
                  <th className="px-3 py-3.5 text-center">Soal</th>
                  <th className="px-3 py-3.5 text-center">Terjawab</th>
                  <th className="px-3 py-3.5 text-center text-emerald-600">Benar</th>
                  <th className="px-3 py-3.5 text-center text-rose-600">Salah</th>
                  <th className="px-3 py-3.5 text-center text-slate-400">Kosong</th>
                  <th className="px-4 py-3.5 text-center">Nilai</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5">Tanggal</th>
                  <th className="px-4 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium text-slate-700 dark:text-slate-300">
                {sortedResults.map((r, index) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-4 font-bold text-slate-400">{index + 1}</td>
                    <td className="px-4 py-4 font-black text-slate-900 dark:text-slate-100">
                      {r.studentName}
                    </td>
                    <td className="px-4 py-4 font-bold text-slate-500 whitespace-nowrap">
                      {r.studentClass || 'Kelas 5 SD'}
                    </td>
                    <td className="px-4 py-4 font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      {r.teacherName || 'Guru Pembina'}
                    </td>
                    <td className="px-4 py-4">{getSubjectBadge(r.subjectId)}</td>
                    <td className="px-4 py-4 font-bold text-slate-800 dark:text-slate-200 max-w-xs truncate">
                      {r.examTitle}
                    </td>
                    <td className="px-3 py-4 text-center font-bold">{r.totalQuestions}</td>
                    <td className="px-3 py-4 text-center font-bold text-blue-600">{r.answeredCount}</td>
                    <td className="px-3 py-4 text-center font-black text-emerald-600">{r.correctCount}</td>
                    <td className="px-3 py-4 text-center font-black text-rose-600">{r.wrongCount}</td>
                    <td className="px-3 py-4 text-center font-bold text-slate-400">{r.unansweredCount}</td>
                    <td className="px-4 py-4 text-center font-black text-base text-blue-600 dark:text-blue-400">
                      {r.score}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-block text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {r.status || 'SELESAI'}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-bold text-slate-400 whitespace-nowrap">
                      {formatDate(r.submittedAt || r.createdAt)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/admin/results/${r.id}`)}
                        rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                        className="rounded-xl font-bold"
                      >
                        Detail
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
