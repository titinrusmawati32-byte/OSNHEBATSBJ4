import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ExcelInspectionResult } from '../../lib/parsers/excelParser';
import { ExcelColumnMapping } from '../../types/question';
import { Table, CheckCircle2, ArrowRight, Layers, FileSpreadsheet } from 'lucide-react';

interface ExcelColumnMapperModalProps {
  isOpen: boolean;
  onClose: () => void;
  inspection: ExcelInspectionResult;
  onConfirmMapping: (mapping: ExcelColumnMapping) => void;
  isProcessing: boolean;
}

export const ExcelColumnMapperModal: React.FC<ExcelColumnMapperModalProps> = ({
  isOpen,
  onClose,
  inspection,
  onConfirmMapping,
  isProcessing,
}) => {
  const [selectedSheet, setSelectedSheet] = useState(inspection.currentSheet);
  const [mapping, setMapping] = useState<ExcelColumnMapping>(inspection.suggestedMapping);

  const headersWithEmpty = ['', ...inspection.headers];

  const handleFieldChange = (field: keyof ExcelColumnMapping, value: string) => {
    setMapping((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const mappingFields: Array<{
    key: keyof ExcelColumnMapping;
    label: string;
    required: boolean;
    helper: string;
  }> = [
    { key: 'questionNumberCol', label: 'Kolom Nomor Soal', required: false, helper: 'Nomor urut (No / Nomor / Num)' },
    { key: 'questionTextCol', label: 'Kolom Pertanyaan (Soal)', required: true, helper: 'Teks soal atau stimulus' },
    { key: 'optionACol', label: 'Kolom Pilihan A', required: true, helper: 'Teks opsi A' },
    { key: 'optionBCol', label: 'Kolom Pilihan B', required: true, helper: 'Teks opsi B' },
    { key: 'optionCCol', label: 'Kolom Pilihan C', required: false, helper: 'Teks opsi C' },
    { key: 'optionDCol', label: 'Kolom Pilihan D', required: false, helper: 'Teks opsi D' },
    { key: 'optionECol', label: 'Kolom Pilihan E (Opsional)', required: false, helper: 'Teks opsi E jika ada' },
    { key: 'correctAnswerCol', label: 'Kolom Kunci Jawaban', required: false, helper: 'Huruf kunci (A, B, C, D, atau E)' },
    { key: 'explanationCol', label: 'Kolom Pembahasan', required: false, helper: 'Penjelasan solusi soal' },
    { key: 'imageCol', label: 'Kolom URL Gambar', required: false, helper: 'Tautan gambar atau diagram' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pemetaan Kolom Spreadsheet (Column Mapping)"
      size="xl"
    >
      <div className="space-y-6 text-left text-xs sm:text-sm">
        {/* Info Banner */}
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-black text-emerald-900 dark:text-emerald-100 text-xs sm:text-sm">
              Sesuaikan Posisi Kolom Dokumen Excel Anda
            </h4>
            <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed">
              Sistem telah mendeteksi susunan header dari sheet <strong>"{inspection.currentSheet}"</strong> ({inspection.totalRows} baris data). Anda dapat menyesuaikan atau mengubah pemetaan kolom sebelum parsing dilakukan.
            </p>
          </div>
        </div>

        {/* Sheet Selector (if workbook has multiple sheets) */}
        {inspection.sheetNames.length > 1 && (
          <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
            <Layers className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Pilih Lembar Kerja (Sheet):
            </span>
            <select
              value={selectedSheet}
              onChange={(e) => {
                setSelectedSheet(e.target.value);
                setMapping((prev) => ({ ...prev, sheetName: e.target.value }));
              }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold"
            >
              {inspection.sheetNames.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Mapping Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {mappingFields.map((f) => {
            const currentVal = mapping[f.key] as string;
            return (
              <div
                key={f.key}
                className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <span>{f.label}</span>
                    {f.required && <span className="text-rose-500">*</span>}
                  </label>
                  {currentVal && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                </div>

                <select
                  value={currentVal || ''}
                  onChange={(e) => handleFieldChange(f.key, e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Tidak Dipetakan --</option>
                  {headersWithEmpty.map((h, idx) => (
                    <option key={`${h}-${idx}`} value={h}>
                      {h ? `[Kolom] ${h}` : '-- Kosong --'}
                    </option>
                  ))}
                </select>

                <p className="text-[10px] text-slate-400 font-medium truncate">
                  {f.helper}
                </p>
              </div>
            );
          })}
        </div>

        {/* Sample Rows Preview */}
        {inspection.sampleRows.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Table className="w-3.5 h-3.5" />
              Pratinjau Data Asli Spreadsheet (Baris Awal):
            </h4>
            <div className="max-h-40 overflow-x-auto overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl text-[11px]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 font-black text-slate-700 dark:text-slate-200">
                  <tr>
                    {inspection.headers.map((h, i) => (
                      <th key={i} className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                        {h || `Col ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {inspection.sampleRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      {inspection.headers.map((_, cIdx) => (
                        <td key={cIdx} className="p-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {String(row[cIdx] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isProcessing}>
            Batal
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onConfirmMapping(mapping)}
            isLoading={isProcessing}
            rightIcon={<ArrowRight className="w-4 h-4" />}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Lanjutkan Parsing dengan Mapping Ini
          </Button>
        </div>
      </div>
    </Modal>
  );
};
