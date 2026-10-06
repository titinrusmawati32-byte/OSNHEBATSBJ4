import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  QuestionImportSession,
  ParsedQuestion,
  QuestionSourceType,
} from '../../types/question';
import {
  getImportSession,
  getImportHistory,
  updateImportSession,
  cancelImportSession,
  saveImportedQuestions,
} from '../../services/questionImportService';
import { SideBySideReview } from '../../components/questions/SideBySideReview';
import { Button } from '../../components/ui/Button';
import { Loader2, AlertCircle, ArrowLeft, Layers } from 'lucide-react';

export const QuestionImportReviewPage: React.FC = () => {
  const { importId } = useParams<{ importId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [session, setSession] = useState<QuestionImportSession | null>(null);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const basePath = profile?.role === 'admin' ? '/admin/questions' : '/teacher/questions';

  useEffect(() => {
    async function loadSession() {
      if (!profile) return;
      setLoading(true);

      try {
        let targetId = importId;

        // If no ID in route, try to fetch the most recent review session
        if (!targetId) {
          const history = await getImportHistory(profile.role, profile.uid);
          const active = history.find((h) => h.status === 'review');
          if (active) {
            targetId = active.id;
          } else if (history.length > 0) {
            targetId = history[0].id;
          }
        }

        if (targetId) {
          const loaded = await getImportSession(targetId);
          if (loaded) {
            setSession(loaded);
            setQuestions(loaded.parsedQuestions || []);
          } else {
            showToast('Sesi import tidak ditemukan.', 'error');
          }
        }
      } catch (err: any) {
        console.error('Failed to load import review session:', err);
        showToast('Gagal memuat sesi review: ' + (err.message || 'Error'), 'error');
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, [importId, profile]);

  const handleUpdateQuestion = (updated: ParsedQuestion) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === updated.id ? updated : q))
    );

    if (session) {
      const updatedList = questions.map((q) => (q.id === updated.id ? updated : q));
      updateImportSession(session.id, {
        parsedQuestions: updatedList,
        validCount: updatedList.filter((q) => q.validationStatus === 'VALID').length,
        reviewCount: updatedList.filter((q) => q.validationStatus === 'NEEDS_REVIEW').length,
        failedCount: updatedList.filter((q) => q.validationStatus === 'FAILED').length,
      }).catch(console.error);
    }
  };

  const handleDeleteQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    showToast('Soal dihapus dari daftar import.', 'info');
  };

  const handleFinalSave = async (onlyValid: boolean = false) => {
    if (!profile || !session) return;

    const questionsToSave = onlyValid
      ? questions.filter((q) => q.validationStatus === 'VALID')
      : questions;

    if (questionsToSave.length === 0) {
      showToast('Tidak ada soal yang siap disimpan.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const res = await saveImportedQuestions(
        session.id,
        questionsToSave,
        session.subjectId,
        profile,
        session.fileName,
        session.fileType as QuestionSourceType
      );

      showToast(`Sukses! ${res.savedCount} soal berhasil diverifikasi dan disimpan ke Bank Soal.`, 'success');
      navigate(basePath);
    } catch (err: any) {
      console.error(err);
      showToast('Gagal menyimpan soal: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async () => {
    if (session) {
      await cancelImportSession(session.id);
    }
    showToast('Sesi review dibatalkan.', 'info');
    navigate(basePath);
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Memuat Dokumen Asli dan Hasil Ekstraksi...
        </h3>
        <p className="text-xs text-slate-400">Menyinkronkan lembar review berdampingan.</p>
      </div>
    );
  }

  if (!session || questions.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950 text-amber-600 flex items-center justify-center border border-amber-200 dark:border-amber-800">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
          Tidak Ada Sesi Review Aktif
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
          Belum ada sesi import yang menunggu proses review atau seluruh soal pada sesi ini telah selesai disimpan.
        </p>
        <Button variant="primary" size="sm" onClick={() => navigate(basePath)}>
          Kembali ke Bank Soal
        </Button>
      </div>
    );
  }

  return (
    <SideBySideReview
      session={session}
      questions={questions}
      onUpdateQuestion={handleUpdateQuestion}
      onDeleteQuestion={handleDeleteQuestion}
      onFinalSave={handleFinalSave}
      onCancel={handleCancel}
      isSaving={isSaving}
    />
  );
};
