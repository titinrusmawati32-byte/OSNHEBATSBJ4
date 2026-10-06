import React, { useState } from 'react';
import {
  ParsedQuestion,
  QuestionImportSession,
  ValidationStatus,
} from '../../types/question';
import { Button } from '../ui/Button';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  FileSpreadsheet,
  Table,
  Edit3,
  Trash2,
  Sparkles,
  Save,
  ArrowLeft,
  Search,
  Filter,
  Eye,
  Check,
  Flag,
  HelpCircle,
  Image as ImageIcon,
  RotateCcw,
} from 'lucide-react';

interface SideBySideReviewProps {
  session: QuestionImportSession;
  questions: ParsedQuestion[];
  onUpdateQuestion: (updated: ParsedQuestion) => void;
  onDeleteQuestion: (id: string) => void;
  onFinalSave: (onlyValid?: boolean) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

export const SideBySideReview: React.FC<SideBySideReviewProps> = ({
  session,
  questions,
  onUpdateQuestion,
  onDeleteQuestion,
  onFinalSave,
  onCancel,
  isSaving,
}) => {
  const [filter, setFilter] = useState<'all' | 'valid' | 'needsReview' | 'failed' | 'edited'>('all');
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter questions
  const filteredQuestions = questions.filter((q) => {
    if (filter === 'valid' && q.validationStatus !== 'VALID') return false;
    if (filter === 'needsReview' && q.validationStatus !== 'NEEDS_REVIEW') return false;
    if (filter === 'failed' && q.validationStatus !== 'FAILED') return false;
    if (filter === 'edited' && !q.isEdited) return false;

    if (search.trim()) {
      const s = search.toLowerCase();
      return (
        q.questionText.toLowerCase().includes(s) ||
        q.options.A.toLowerCase().includes(s) ||
        q.options.B.toLowerCase().includes(s) ||
        String(q.questionNumber).includes(s)
      );
    }
    return true;
  });

  const activeQuestion = filteredQuestions[selectedIndex] || filteredQuestions[0] || questions[0];

  const validCount = questions.filter((q) => q.validationStatus === 'VALID').length;
  const reviewCount = questions.filter((q) => q.validationStatus === 'NEEDS_REVIEW').length;
  const failedCount = questions.filter((q) => q.validationStatus === 'FAILED').length;

  const handleFieldChange = (
    field: 'questionText' | 'correctAnswer' | 'explanation' | 'difficulty',
    value: any
  ) => {
    if (!activeQuestion) return;
    const updated: ParsedQuestion = {
      ...activeQuestion,
      [field]: value,
      isEdited: true,
      hasDifferencesFromSource: true,
    };

    // Re-check validation
    if (updated.questionText && updated.options.A && updated.options.B) {
      if (updated.correctAnswer) {
        updated.validationStatus = 'VALID';
        updated.needsReview = false;
      } else {
        updated.validationStatus = 'NEEDS_REVIEW';
        updated.needsReview = true;
      }
    }

    onUpdateQuestion(updated);
  };

  const handleOptionChange = (optKey: 'A' | 'B' | 'C' | 'D', value: string) => {
    if (!activeQuestion) return;
    const updated: ParsedQuestion = {
      ...activeQuestion,
      options: {
        ...activeQuestion.options,
        [optKey]: value,
      },
      isEdited: true,
      hasDifferencesFromSource: true,
    };
    onUpdateQuestion(updated);
  };

  const handleMarkApproved = () => {
    if (!activeQuestion) return;
    const updated: ParsedQuestion = {
      ...activeQuestion,
      validationStatus: 'VALID',
      needsReview: false,
      reviewReasons: [],
    };
    onUpdateQuestion(updated);
  };

  const handleToggleReview = () => {
    if (!activeQuestion) return;
    const nextNeedsReview = !activeQuestion.needsReview;
    const updated: ParsedQuestion = {
      ...activeQuestion,
      validationStatus: nextNeedsReview ? 'NEEDS_REVIEW' : 'VALID',
      needsReview: nextNeedsReview,
    };
    onUpdateQuestion(updated);
  };

  return (
    <div className="space-y-6 text-left max-w-7xl mx-auto pb-16">
      {/* Top Session Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Audit & Review Dokumen Asli vs Ekstraksi
            </span>
            <span className="text-xs font-bold text-slate-400">
              Format: {session.fileType.toUpperCase()}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            {session.fileName}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Total {questions.length} butir soal terdeteksi • Bidang: {session.subjectId.toUpperCase()}
          </p>
        </div>

        {/* Global Save Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
            Batal
          </Button>

          {validCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onFinalSave(true)}
              isLoading={isSaving}
              leftIcon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              className="text-emerald-700 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50"
            >
              Simpan Soal Valid ({validCount})
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={() => onFinalSave(false)}
            isLoading={isSaving}
            leftIcon={<Save className="w-4 h-4" />}
            className="shadow-sm shadow-blue-600/20"
          >
            Simpan Semua ({questions.length}) ke Bank Soal
          </Button>
        </div>
      </div>

      {/* Stats Counter & Filter Pills */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Status filter tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setFilter('all'); setSelectedIndex(0); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filter === 'all'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            Semua ({questions.length})
          </button>

          <button
            onClick={() => { setFilter('valid'); setSelectedIndex(0); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filter === 'valid'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Valid ({validCount})</span>
          </button>

          <button
            onClick={() => { setFilter('needsReview'); setSelectedIndex(0); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filter === 'needsReview'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-amber-600 dark:text-amber-400'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Perlu Review ({reviewCount})</span>
          </button>

          {failedCount > 0 && (
            <button
              onClick={() => { setFilter('failed'); setSelectedIndex(0); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                filter === 'failed'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Gagal ({failedCount})</span>
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Cari dalam hasil ekstraksi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
          />
        </div>
      </div>

      {/* Main Workspace: 2-Column Split View */}
      {filteredQuestions.length === 0 ? (
        <div className="py-20 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-3">
          <HelpCircle className="w-12 h-12 text-slate-400 mx-auto" />
          <h3 className="font-bold text-slate-700 dark:text-slate-300">
            Tidak ada butir soal pada filter ini
          </h3>
          <p className="text-xs text-slate-400">
            Coba pilih filter lain atau hapus kata pencarian.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Question Navigator Carousel / Mini Sidebar (Span 3) */}
          <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-xs space-y-3 max-h-[750px] overflow-y-auto">
            <div className="text-[11px] font-black uppercase text-slate-400 tracking-wider px-2">
              Daftar Soal ({filteredQuestions.length})
            </div>

            <div className="space-y-1.5">
              {filteredQuestions.map((q, idx) => {
                const isActive = activeQuestion?.id === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => setSelectedIndex(idx)}
                    className={`w-full p-2.5 rounded-2xl text-left transition-all flex items-center justify-between cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-950/70 border border-blue-500 shadow-xs'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                          q.validationStatus === 'VALID'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : q.validationStatus === 'NEEDS_REVIEW'
                            ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                            : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                        }`}
                      >
                        {q.questionNumber || idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                        {q.questionText.slice(0, 35) || `Soal No. ${q.questionNumber}`}
                      </span>
                    </div>

                    {q.isEdited && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" title="Telah diedit" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* TWO SIDE-BY-SIDE PANELS (Span 9) */}
          <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* PANEL KIRI: DOKUMEN ASLI */}
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-black uppercase">
                    PANEL KIRI
                  </span>
                  <h3 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
                    Dokumen Sumber Asli
                  </h3>
                </div>

                <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2">
                  {activeQuestion.sourcePage && <span>Hal. {activeQuestion.sourcePage}</span>}
                  {activeQuestion.sourceSheet && <span>Sheet: {activeQuestion.sourceSheet}</span>}
                  {activeQuestion.sourceRow && <span>Baris: {activeQuestion.sourceRow}</span>}
                </div>
              </div>

              {/* Source Snippet Box */}
              <div className="flex-1 space-y-4">
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto selection:bg-amber-100">
                  {activeQuestion.originalSnippet || activeQuestion.originalText || 'Tidak ada teks sumber langsung tercatat.'}
                </div>

                {/* Embedded Image Preview if any */}
                {activeQuestion.imageUrl && (
                  <div className="p-3 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                      Gambar Terkait (Dokumen Asli):
                    </span>
                    <img
                      src={activeQuestion.imageUrl}
                      alt="Gambar Dokumen Asli"
                      className="max-h-48 rounded-xl object-contain mx-auto"
                    />
                  </div>
                )}
              </div>

              {/* Source Mapping Footer */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                <span>Metode: {activeQuestion.extractionMethod}</span>
                <span>File: {activeQuestion.sourceFileName}</span>
              </div>
            </div>

            {/* PANEL KANAN: HASIL EKSTRAKSI (INTERACTIVE EDITING) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-black uppercase">
                    PANEL KANAN
                  </span>
                  <h3 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200">
                    Hasil Ekstraksi & Struktur
                  </h3>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-1.5">
                  {activeQuestion.validationStatus === 'VALID' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      VALID
                    </span>
                  )}
                  {activeQuestion.validationStatus === 'NEEDS_REVIEW' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-50 text-amber-600 border border-amber-200 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      PERLU REVIEW
                    </span>
                  )}
                  {activeQuestion.validationStatus === 'FAILED' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-50 text-rose-600 border border-rose-200 flex items-center gap-1">
                      <XCircle className="w-3 h-3" />
                      GAGAL
                    </span>
                  )}
                </div>
              </div>

              {/* Warnings / Needs Review Notice */}
              {activeQuestion.reviewReasons.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-1 text-xs text-amber-900 dark:text-amber-200">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Catatan Review Otomatis:</span>
                  </div>
                  <ul className="list-disc pl-5 text-[11px] space-y-0.5">
                    {activeQuestion.reviewReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Difference Notice (Requirement L) */}
              {activeQuestion.hasDifferencesFromSource && (
                <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-700 dark:text-blue-300 font-bold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>⚠ TERDETEKSI PERUBAHAN DARI SUMBER ASLI (Manual Edit)</span>
                </div>
              )}

              {/* Question Textarea */}
              <div className="space-y-1">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Teks Pertanyaan:
                </label>
                <textarea
                  value={activeQuestion.questionText}
                  onChange={(e) => handleFieldChange('questionText', e.target.value)}
                  rows={4}
                  className="w-full text-xs p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Options A, B, C, D */}
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Pilihan Jawaban (A, B, C, D):
                </label>
                {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                  const isKey = activeQuestion.correctAnswer === optKey;
                  return (
                    <div key={optKey} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleFieldChange('correctAnswer', optKey)}
                        className={`w-7 h-7 rounded-xl font-black text-xs shrink-0 transition-colors cursor-pointer flex items-center justify-center ${
                          isKey
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                        }`}
                        title={isKey ? 'Kunci Jawaban Aktif' : `Jadikan pilihan ${optKey} sebagai kunci`}
                      >
                        {optKey}
                      </button>
                      <input
                        type="text"
                        value={activeQuestion.options[optKey]}
                        placeholder={`Pilihan ${optKey} (Kosong jika tidak ada di dokumen)`}
                        onChange={(e) => handleOptionChange(optKey, e.target.value)}
                        className={`flex-1 text-xs px-3 py-2 rounded-xl border ${
                          isKey
                            ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                        } text-slate-800 dark:text-slate-100 focus:outline-hidden`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Answer Key & Difficulty Selector */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Kunci Jawaban:
                  </label>
                  <select
                    value={activeQuestion.correctAnswer || ''}
                    onChange={(e) => handleFieldChange('correctAnswer', e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-bold"
                  >
                    <option value="">-- Belum Ada Kunci --</option>
                    <option value="A">Pilihan A</option>
                    <option value="B">Pilihan B</option>
                    <option value="C">Pilihan C</option>
                    <option value="D">Pilihan D</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                    Tingkat Kesulitan:
                  </label>
                  <select
                    value={activeQuestion.difficulty}
                    onChange={(e) => handleFieldChange('difficulty', e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-bold"
                  >
                    <option value="easy">Mudah</option>
                    <option value="medium">Sedang</option>
                    <option value="hard">Sulit</option>
                  </select>
                </div>
              </div>

              {/* Explanation Field */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-400">
                  Pembahasan (Opsional):
                </label>
                <textarea
                  value={activeQuestion.explanation || ''}
                  onChange={(e) => handleFieldChange('explanation', e.target.value)}
                  placeholder="Tidak ada pembahasan otomatis jika tidak terdapat di dokumen asli."
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                />
              </div>

              {/* Panel Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onDeleteQuestion(activeQuestion.id)}
                  className="inline-flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-bold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Soal</span>
                </button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleReview}
                    leftIcon={<Flag className="w-3.5 h-3.5" />}
                  >
                    {activeQuestion.needsReview ? 'Tandai Selesai' : 'Tandai Review'}
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleMarkApproved}
                    leftIcon={<Check className="w-3.5 h-3.5" />}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    Setujui Soal Ini
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
