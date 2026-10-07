import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { 
  MaterialType, 
  MaterialSubject, 
  MaterialStatus, 
  TrainingMaterial 
} from '../../types/material';
import { materialService } from '../../services/materialService';
import { materialStorageService } from '../../services/materialStorageService';
import { 
  extractYoutubeVideoId, 
  isValidYoutubeUrl, 
  createYoutubeEmbedUrl 
} from '../../lib/youtube';
import { 
  FileText, 
  Youtube, 
  Upload, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  CloudUpload,
  Link as LinkIcon,
  FileCheck
} from 'lucide-react';

interface MaterialFormProps {
  onClose: () => void;
  onSuccess: () => void;
  editMaterial?: TrainingMaterial | null;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const MaterialForm: React.FC<MaterialFormProps> = ({ 
  onClose, 
  onSuccess, 
  editMaterial 
}) => {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [title, setTitle] = useState(editMaterial?.title || '');
  const [description, setDescription] = useState(editMaterial?.description || '');
  const [subjectId, setSubjectId] = useState<MaterialSubject>(editMaterial?.subjectId || 'ipa');
  const [gradeLevel, setGradeLevel] = useState(editMaterial?.gradeLevel || '');
  const [topic, setTopic] = useState(editMaterial?.topic || '');
  const [type, setType] = useState<MaterialType>(editMaterial?.type || 'pdf');
  const [status, setStatus] = useState<MaterialStatus>(editMaterial?.status || 'published');

  // PDF Upload Mode State ('file' or 'url')
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>(
    editMaterial?.filePath ? 'file' : (editMaterial?.fileUrl ? 'url' : 'file')
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState(editMaterial?.fileUrl || '');
  const [uploadProgress, setUploadProgress] = useState(0);

  // YouTube State
  const [youtubeUrl, setYoutubeUrl] = useState(editMaterial?.youtubeUrl || '');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('Format file harus berupa dokumen PDF (.pdf).', 'error');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      showToast(`Ukuran file (${sizeMB} MB) melebihi batas maksimal 50 MB.`, 'error');
      return;
    }

    setSelectedFile(file);
    if (!title) {
      // Auto fill title from filename without extension if title is empty
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      setTitle(baseName);
    }
    showToast(`File "${file.name}" berhasil dipilih (${(file.size / (1024 * 1024)).toFixed(1)} MB).`, 'success');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (!title.trim()) {
      showToast('Judul materi wajib diisi.', 'warning');
      return;
    }

    setIsSubmitting(true);

    try {
      let materialData: any = {
        title,
        description,
        subjectId,
        gradeLevel,
        topic,
        type,
        status,
        createdBy: profile.uid,
        createdByName: profile.displayName || profile.name || profile.username,
      };

      if (type === 'youtube') {
        if (!isValidYoutubeUrl(youtubeUrl)) {
          showToast('URL YouTube tidak valid. Silakan masukkan URL video YouTube yang benar.', 'error');
          setIsSubmitting(false);
          return;
        }
        const videoId = extractYoutubeVideoId(youtubeUrl);
        if (videoId) {
          materialData.youtubeUrl = youtubeUrl;
          materialData.youtubeVideoId = videoId;
          materialData.youtubeEmbedUrl = createYoutubeEmbedUrl(videoId);
        }
      } else {
        // PDF Type handling
        if (uploadMode === 'file') {
          if (!selectedFile && !editMaterial?.fileUrl) {
            showToast('Silakan pilih file PDF atau gunakan opsi URL Google Drive.', 'warning');
            setIsSubmitting(false);
            return;
          }

          const materialId = editMaterial ? editMaterial.id : materialService.generateMaterialId();
          let finalDownloadUrl = editMaterial?.fileUrl || '';
          let finalFilePath = editMaterial?.filePath || '';
          let finalFileName = editMaterial?.fileName || title;
          let finalFileSize = editMaterial?.fileSize || 0;

          if (selectedFile) {
            finalFilePath = `materials/${subjectId}/${materialId}/document.pdf`;
            setUploadProgress(10);
            finalDownloadUrl = await materialStorageService.uploadMaterialPdf(
              subjectId,
              materialId,
              selectedFile,
              (progress) => setUploadProgress(Math.round(progress))
            );
            finalFileName = selectedFile.name;
            finalFileSize = selectedFile.size;
          }

          materialData.fileUrl = finalDownloadUrl;
          materialData.filePath = finalFilePath;
          materialData.fileName = finalFileName;
          materialData.fileSize = finalFileSize;

          if (editMaterial) {
            await materialService.updateMaterial(editMaterial.id, materialData);
            showToast('Materi PDF berhasil diperbarui.', 'success');
          } else {
            await materialService.createMaterialWithId(materialId, materialData);
            showToast('Materi PDF berhasil diunggah dan disimpan.', 'success');
          }
          onSuccess();
          return;
        } else {
          // URL Mode (Google Drive / Direct URL)
          if (!fileUrl.trim()) {
            showToast('URL File PDF / Google Drive wajib diisi.', 'warning');
            setIsSubmitting(false);
            return;
          }
          materialData.fileUrl = fileUrl.trim();
          materialData.fileName = title || 'Dokumen PDF';
          materialData.fileSize = 0;
          materialData.filePath = '';
        }
      }

      if (editMaterial) {
        await materialService.updateMaterial(editMaterial.id, materialData);
        showToast('Materi berhasil diperbarui.', 'success');
      } else {
        await materialService.createMaterial(materialData);
        showToast('Materi berhasil ditambahkan.', 'success');
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error saving material:', error);
      showToast(`Gagal menyimpan materi: ${error.message || 'Silakan coba lagi.'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full text-left">
      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input 
              label="Judul Materi *"
              placeholder="Contoh: Modul Pembinaan Olimpiade Matematika Bab 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
              Deskripsi Materi
            </label>
            <textarea 
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all outline-hidden text-sm"
              rows={3}
              placeholder="Jelaskan ringkasan isi materi dan target kompetisi..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <Select 
            label="Mata Pelajaran *"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value as MaterialSubject)}
            options={[
              { value: 'ipa', label: 'IPA' },
              { value: 'ips', label: 'IPS' },
              { value: 'matematika', label: 'Matematika' },
              { value: 'bahasa_inggris', label: 'Bahasa Inggris' },
            ]}
          />

          <Input 
            label="Tingkat / Kelas"
            placeholder="Contoh: Kelas 5-6 SD"
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
          />

          <Input 
            label="Topik / Bab"
            placeholder="Contoh: Aljabar & Bilangan"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />

          <Select 
            label="Jenis Materi *"
            value={type}
            onChange={(e) => setType(e.target.value as MaterialType)}
            options={[
              { value: 'pdf', label: 'Dokumen PDF (Maks. 50 MB / Google Drive)' },
              { value: 'youtube', label: 'Video Pembelajaran YouTube' },
            ]}
            disabled={!!editMaterial}
          />

          <Select 
            label="Status Publikasi"
            value={status}
            onChange={(e) => setStatus(e.target.value as MaterialStatus)}
            options={[
              { value: 'published', label: 'Langsung Publish (Dapat dilihat siswa)' },
              { value: 'draft', label: 'Simpan sebagai Draf' },
              { value: 'archived', label: 'Arsip' },
            ]}
          />
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
          {type === 'pdf' ? (
            <div className="space-y-4">
              {/* Upload Mode Selector */}
              <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setUploadMode('file')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    uploadMode === 'file' 
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>Upload File PDF (Maks. 50 MB)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('url')}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    uploadMode === 'url' 
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <LinkIcon className="w-4 h-4" />
                  <span>URL Google Drive / Link</span>
                </button>
              </div>

              {uploadMode === 'file' ? (
                <div className="space-y-3">
                  <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-3xl p-6 text-center transition-all bg-slate-50/50 dark:bg-slate-850/50 relative group">
                    <input 
                      type="file" 
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                        <Upload className="w-8 h-8" />
                      </div>
                      
                      {selectedFile ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            <FileCheck className="w-4 h-4" />
                            <span className="truncate max-w-xs">{selectedFile.name}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">
                            Ukuran: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB (Maks. 50 MB)
                          </p>
                        </div>
                      ) : editMaterial?.fileUrl && !selectedFile ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-center gap-2 text-xs font-bold text-blue-600">
                            <FileText className="w-4 h-4" />
                            <span>File PDF Tersimpan Sebelumnya</span>
                          </div>
                          <p className="text-[10px] text-slate-400">Klik untuk mengganti dengan file baru (maks. 50 MB)</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            Seret file PDF ke sini atau <span className="text-blue-600 underline">klik untuk memilih</span>
                          </p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold">
                            Format PDF • Maksimal Ukuran 50 MB
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {isSubmitting && uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                        <span>Mengunggah ke server...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                        <div 
                          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <Input 
                    label="URL Google Drive / Tautan PDF Eksternal *"
                    placeholder="https://drive.google.com/file/d/... atau https://..."
                    value={fileUrl}
                    onChange={(e) => setFileUrl(e.target.value)}
                    leftIcon={<LinkIcon className="w-4 h-4 text-blue-600" />}
                    helperText="Pastikan tautan Google Drive disetel ke 'Siapa saja yang memiliki link dapat melihat' (Anyone with the link can view)"
                    required
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Input 
                label="URL Video YouTube *"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                leftIcon={<Youtube className="w-4 h-4 text-rose-600" />}
                helperText="Masukkan URL video atau live streaming YouTube"
                required
              />
              
              {youtubeUrl && isValidYoutubeUrl(youtubeUrl) && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 flex items-center gap-2 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>URL YouTube Valid</span>
                </div>
              )}

              {youtubeUrl && !isValidYoutubeUrl(youtubeUrl) && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 flex items-center gap-2 text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase">
                  <AlertCircle className="w-4 h-4" />
                  <span>URL YouTube tidak valid. Silakan periksa kembali tautan.</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose}
            disabled={isSubmitting}
          >
            Batal
          </Button>
          <Button 
            type="submit" 
            variant="primary"
            isLoading={isSubmitting}
            leftIcon={isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}
          >
            {editMaterial ? 'Simpan Perubahan' : 'Unggah & Simpan Materi'}
          </Button>
        </div>
      </form>
    </div>
  );
};
