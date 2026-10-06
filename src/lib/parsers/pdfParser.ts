import * as pdfjsLib from 'pdfjs-dist';
import { ParsedQuestion, RawDocument } from '../../types/question';
import { parseQuestionsFromRawText } from './questionParser';

// Set up worker source for browser environment safely
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export interface PdfParseResult {
  questions: ParsedQuestion[];
  numPages: number;
  rawText: string;
  isScanOnly: boolean;
  scanWarning?: string;
  rawDocument: RawDocument;
}

interface SpatialTextItem {
  str: string;
  x: number;
  y: number;
  height: number;
  width: number;
}

export async function parsePdfDocument(
  fileBuffer: ArrayBuffer,
  fileName: string = 'Dokumen.pdf'
): Promise<PdfParseResult> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;

    const pageRecords: Array<{ pageNumber: number; text: string }> = [];
    const fullTextBlocks: string[] = [];
    let totalCharCount = 0;

    for (let p = 1; p <= numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const textContent = await page.getTextContent();

      const items: SpatialTextItem[] = [];

      for (const item of textContent.items as any[]) {
        if (!item?.str) continue;
        const transform = item.transform || [1, 0, 0, 1, 0, 0];
        const x = transform[4];
        const y = transform[5]; // In PDF, y is measured from bottom up
        const height = item.height || 10;
        const width = item.width || 10;

        items.push({
          str: item.str,
          x,
          y,
          height,
          width,
        });
      }

      // Spatial line clustering:
      // Sort primarily by Y descending (top to bottom), with a line tolerance band (~4pt)
      // and secondarily by X ascending (left to right)
      const lineTolerance = 4;
      items.sort((a, b) => {
        const yDiff = Math.abs(a.y - b.y);
        if (yDiff <= lineTolerance) {
          return a.x - b.x; // Same line, left to right
        }
        return b.y - a.y; // Higher Y first (top to bottom)
      });

      // Group items into coherent lines with smart spacing:
      // Prevent inserting spaces inside fragmented word pieces (e.g. "Per" + "hatikan")
      const pageLines: string[] = [];
      let currentLineY: number | null = null;
      let currentLineText = '';
      let prevItemRight: number | null = null;

      for (const it of items) {
        if (currentLineY === null || Math.abs(it.y - currentLineY) > lineTolerance) {
          if (currentLineText.trim().length > 0) {
            pageLines.push(currentLineText.trim());
          }
          currentLineY = it.y;
          currentLineText = it.str;
          prevItemRight = it.x + it.width;
        } else {
          // Check horizontal distance between previous item and this item
          const gap = prevItemRight !== null ? it.x - prevItemRight : 0;
          if (gap > 2.5 && !currentLineText.endsWith(' ') && !it.str.startsWith(' ')) {
            currentLineText += ' ' + it.str;
          } else {
            currentLineText += it.str;
          }
          prevItemRight = it.x + it.width;
        }
      }

      if (currentLineText.trim().length > 0) {
        pageLines.push(currentLineText.trim());
      }

      const cleanPageText = pageLines.join('\n').trim();
      totalCharCount += cleanPageText.length;

      pageRecords.push({
        pageNumber: p,
        text: cleanPageText,
      });

      fullTextBlocks.push(`--- Halaman ${p} ---\n` + cleanPageText);
    }

    const fullRawText = fullTextBlocks.join('\n\n');

    // Detect Scanned / Non-searchable PDF
    const isScanOnly = totalCharCount < 60 && numPages >= 1;
    const scanWarning = isScanOnly
      ? 'PDF ini terdeteksi sebagai dokumen scan tanpa lapisan teks selectable. Hasil ekstraksi teks memerlukan OCR dan harus diverifikasi manual secara menyeluruh.'
      : undefined;

    const rawDocument: RawDocument = {
      importId: `raw_pdf_${Date.now()}`,
      fileName,
      fileType: 'pdf',
      rawText: fullRawText,
      pages: pageRecords,
      extractionMethod: isScanOnly ? 'scanned_pdf_notice' : 'pdf_spatial_ordering',
      extractionWarnings: scanWarning ? [scanWarning] : [],
      extractedAt: new Date(),
    };

    if (isScanOnly) {
      return {
        questions: [],
        numPages,
        rawText: fullRawText,
        isScanOnly: true,
        scanWarning,
        rawDocument,
      };
    }

    // Parse questions using the strict parser
    const questions = parseQuestionsFromRawText(fullRawText, {
      sourceFileName: fileName,
      sourceType: 'pdf',
      extractionMethod: 'pdf_spatial_ordering',
    });

    // Assign sourcePage based on where the question snippet is located across pages
    questions.forEach((q) => {
      const qNumStr = `${q.questionNumber}`;
      for (const pg of pageRecords) {
        if (pg.text.includes(q.questionText.slice(0, 30)) || pg.text.includes(qNumStr)) {
          q.sourcePage = pg.pageNumber;
          break;
        }
      }
      if (!q.sourcePage) {
        q.sourcePage = 1;
      }
    });

    return {
      questions,
      numPages,
      rawText: fullRawText,
      isScanOnly: false,
      rawDocument,
    };
  } catch (error: any) {
    console.error('PDF parsing error:', error);
    throw new Error(
      'Gagal membaca file PDF: ' +
        (error.message || 'File corrupt atau format tidak didukung.')
    );
  }
}
