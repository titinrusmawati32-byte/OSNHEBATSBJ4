import { GoogleGenAI } from '@google/genai';
import { ParsedQuestion, ValidationStatus, QuestionDifficulty } from '../../types/question';

/**
 * AI Structure Assistant strictly enforces ZERO HALLUCINATION.
 * AI is only permitted to identify structure (question number, question text, options A-E, answer key, explanation).
 * Under NO circumstances may AI invent missing text, alter numbers, guess missing answer keys, or paraphrase.
 */

const STRICT_SYSTEM_INSTRUCTION = `
Anda adalah asisten pemetaan struktur dokumen soal ujian CBT Olimpiade.
Prinsip Utama: JANGAN PERNAH MENGARANG ATAU MENGUBAH ISI SOAL (ZERO HALLUCINATION & VERBATIM).

Tugas Anda HANYA memisahkan teks dokumen asli yang diberikan ke dalam struktur JSON array:
[
  {
    "questionNumber": 1,
    "questionText": "Teks pertanyaan asli verbatim tanpa diubah",
    "optionA": "Pilihan A asli",
    "optionB": "Pilihan B asli",
    "optionC": "Pilihan C asli",
    "optionD": "Pilihan D asli",
    "optionE": "Pilihan E asli jika ada",
    "correctAnswer": "A/B/C/D/E atau kosong jika tidak ada di dokumen",
    "explanation": "Pembahasan asli jika ada di dokumen",
    "needsReview": boolean,
    "reviewReason": "Alasan jika ada bagian yang ambigu atau tidak lengkap"
  }
]

ATURAN SANGAT KETAT:
1. DILARANG MENGARANG teks yang hilang.
2. DILARANG MENAMBAH pilihan jawaban yang tidak tertulis pada naskah.
3. DILARANG MENGUBAH angka, simbol matematika, rumus, satuan, nama, atau kalimat apapun.
4. DILARANG MENEBAK kunci jawaban jika dokumen asli tidak mencantumkannya. Jika kunci tidak ada di naskah, KOSONGKAN (correctAnswer: "") dan tandai needsReview: true dengan reviewReason: "Kunci jawaban tidak tercantum pada dokumen asli".
5. DILARANG MEMBUAT pembahasan sendiri jika dokumen tidak menyediakannya.
6. DILARANG MEMPARAFRASE teks asli.
7. Jika teks pada naskah tidak terbaca atau rusak, tulis apa adanya dan beri tanda needsReview: true.
8. Output HANYA berupa JSON valid array, tanpa teks pembuka atau markdown penutup lainnya.
`;

export async function assistStructureWithAI(
  rawText: string,
  fileName: string = 'Dokumen'
): Promise<ParsedQuestion[] | null> {
  const apiKey =
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY);

  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    console.warn('Gemini API key is not configured for AI structure assistance.');
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Berikut adalah naskah mentah dokumen ujian "${fileName}". Petakan struktur pertanyaan, opsi A-D (atau E), kunci jawaban, dan pembahasan secara VERBATIM sesuai aturan:\n\n${rawText.slice(
                0,
                30000
              )}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: STRICT_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        temperature: 0.1, // Minimal temperature for strict deterministic output
      },
    });

    const outputText = response.text?.trim() || '';
    if (!outputText) return null;

    const parsedData = JSON.parse(outputText);
    if (!Array.isArray(parsedData) || parsedData.length === 0) return null;

    return parsedData.map((item: any, index: number): ParsedQuestion => {
      const qNum = typeof item.questionNumber === 'number' ? item.questionNumber : index + 1;
      const optA = String(item.optionA || '').trim();
      const optB = String(item.optionB || '').trim();
      const optC = String(item.optionC || '').trim();
      const optD = String(item.optionD || '').trim();
      const optE = item.optionE ? String(item.optionE).trim() : undefined;
      const keyRaw = String(item.correctAnswer || '').trim().toUpperCase();

      let key: 'A' | 'B' | 'C' | 'D' | 'E' | '' = '';
      if (['A', 'B', 'C', 'D', 'E'].includes(keyRaw)) {
        key = keyRaw as any;
      }

      const reviewReasons: string[] = [];
      let validationStatus: ValidationStatus = 'VALID';
      let confidence: 'high' | 'medium' | 'low' = 'high';

      if (!item.questionText?.trim()) {
        reviewReasons.push('Pertanyaan kosong.');
        validationStatus = 'FAILED';
        confidence = 'low';
      }

      if (!optA || !optB) {
        reviewReasons.push('Pilihan A atau B tidak lengkap.');
        validationStatus = 'FAILED';
        confidence = 'low';
      }

      if (!optC || !optD) {
        reviewReasons.push('Pilihan C atau D tidak lengkap.');
        if (validationStatus !== 'FAILED') validationStatus = 'NEEDS_REVIEW';
        if (confidence === 'high') confidence = 'medium';
      }

      if (!key) {
        reviewReasons.push('Kunci jawaban tidak tercantum pada dokumen asli.');
        if (validationStatus !== 'FAILED') validationStatus = 'NEEDS_REVIEW';
        if (confidence === 'high') confidence = 'medium';
      }

      if (item.reviewReason && !reviewReasons.includes(item.reviewReason)) {
        reviewReasons.push(item.reviewReason);
      }

      const needsReview = validationStatus !== 'VALID' || Boolean(item.needsReview);

      return {
        id: `ai_parsed_${Date.now()}_${index + 1}_${Math.random().toString(36).slice(2, 6)}`,
        questionNumber: qNum,
        questionText: String(item.questionText || '').trim(),
        options: {
          A: optA,
          B: optB,
          C: optC,
          D: optD,
          E: optE,
        },
        correctAnswer: key,
        explanation: item.explanation ? String(item.explanation).trim() : undefined,
        difficulty: 'medium',

        validationStatus,
        needsReview,
        reviewReasons,
        reviewReason: reviewReasons.length > 0 ? reviewReasons.join(' ') : undefined,
        confidence,
        isEdited: false,

        sourceFileName: fileName,
        sourceType: 'word',
        sourceQuestionNumber: qNum,
        extractionMethod: 'gemini_strict_structure_assist',

        originalSnippet: `[AI Verbatim Extraction - Question ${qNum}]\n${item.questionText}\nA. ${optA}\nB. ${optB}\nC. ${optC}\nD. ${optD}`,
        originalText: item.questionText,
      };
    });
  } catch (error) {
    console.error('AI Structure Assistance failed:', error);
    return null;
  }
}
