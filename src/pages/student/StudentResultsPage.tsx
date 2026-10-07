import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { resultService } from '../../services/resultService';
import { AttemptResult } from '../../types/result';
import { Button } from '../../components/ui/Button';
import { 
  Award, 
  Search, 
  Calendar, 
  Layers, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  ArrowRight,
  Filter
} from 'lucide-react';

export const StudentResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [results, setResults] = useState<AttemptResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('all');

  useEffect(() => {
    const fetchResults = async () => {
      if (!profile) return;
      setLoading(true);
      try {
        const data = await resultService.getStudentResults(profile.uid);
        setResults(data);
      } catch (err) {
        console.error(err);
        showToast('Gagal memuat rekap nilai.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [profile]);

  const filteredResults = results.filter((r) => {
    if (subjectFilter !== 'all' && r.subjectId !== subjectFilter) return false;
    return r.examTitle.toLowerCase().includes(searchQuery.toLowerCase());
  });

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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-black uppercase tracking-wider mb-2">
            <Award className="w-3.5 h-3.5" />
            <span>Rekap Nilai Siswa</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Nilai & Hasil Ujian Saya
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Daftar rekapitulasi nilai paket ujian pembinaan olimpiade yang telah Anda selesaikan.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama ujian..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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

      {loading ? (
        <div className="py-20 text-center text-xs text-slate-400 flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
          Memuat rekap nilai...
        </div>
      ) : filteredResults.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-4 shadow-xs">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-200 dark:border-blue-800">
            <Award className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            {searchQuery ? 'Hasil tidak ditemukan' : 'Belum Ada Rekap Nilai'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchQuery
              ? `Tidak ada hasil yang cocok dengan kata kunci "${searchQuery}".`
              : 'Anda belum memiliki rekap nilai ujian. Silakan selesaikan ujian yang tersedia.'}
          </p>
        </div>
      ) : (
        /* Modern Responsive Table */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">No</th>
                  <th className="px-4 py-3.5">Paket Ujian</th>
                  <th className="px-4 py-3.5">Bidang</th>
                  <th className="px-4 py-3.5">Tanggal</th>
                  <th className="px-3 py-3.5 text-center">Soal</th>
                  <th className="px-3 py-3.5 text-center">Terjawab</th>
                  <th className="px-3 py-3.5 text-center text-emerald-600">Benar</th>
                  <th className="px-3 py-3.5 text-center text-rose-600">Salah</th>
                  <th className="px-3 py-3.5 text-center text-slate-400">Kosong</th>
                  <th className="px-4 py-3.5 text-center">Nilai</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium text-slate-700 dark:text-slate-300">
                {filteredResults.map((r, index) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-4 font-bold text-slate-400">{index + 1}</td>
                    <td className="px-4 py-4 font-black text-slate-900 dark:text-slate-100 max-w-xs truncate">
                      {r.examTitle}
                    </td>
                    <td className="px-4 py-4">{getSubjectBadge(r.subjectId)}</td>
                    <td className="px-4 py-4 font-bold text-slate-500 whitespace-nowrap">
                      {formatDate(r.submittedAt || r.createdAt)}
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
                    <td className="px-4 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/student/results/${r.id}`)}
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

export const StudentHistoryPage: React.FC = () => {
  return <StudentResultsPage />;
};

export const StudentProfilePage: React.FC = () => {
  const { profile } = useAuth();
  return (
    <div className="max-w-xl mx-auto space-y-6 text-left">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">
          Profil Peserta Olimpiade
        </h3>
        <div className="space-y-4 text-xs sm:text-sm">
          <div>
            <span className="text-slate-400 block text-xs uppercase font-bold">Nama Lengkap</span>
            <span className="font-bold text-slate-900 dark:text-slate-100 text-base">
              {profile?.displayName || profile?.name || 'Siswa'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-xs uppercase font-bold">Asal Sekolah</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {profile?.school || 'SD Mitra Prestasi'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-xs uppercase font-bold">Tingkat Kelas</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {profile?.className || profile?.grade || 'Kelas 5 SD'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
