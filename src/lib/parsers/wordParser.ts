import mammoth from 'mammoth';
import { ParsedQuestion, RawDocument } from '../../types/question';
import { parseQuestionsFromRawText } from './questionParser';

export interface WordParseResult {
  questions: ParsedQuestion[];
  rawText: string;
  hasImageReferences: boolean;
  rawDocument: RawDocument;
  extractedImagesCount: number;
  messages: string[];
}

export async function parseWordDocument(
  fileBuffer: ArrayBuffer,
  fileName: string = 'Dokumen.docx'
): Promise<WordParseResult> {
  try {
    const rawResult = await mammoth.extractRawText({ arrayBuffer: fileBuffer });
    const rawText = rawResult.value || '';
    const messages = (rawResult.messages || []).map((m: any) => m.message || String(m));

    // Convert to HTML to preserve embedded images and table markup
    const extractedImagesList: Array<{
      id: string;
      dataUrl: string;
      relatedQuestionNumber?: number;
    }> = [];
    const questionImageMap: Record<number, string> = {};

    let imgCounter = 0;
    const mammothAny = mammoth as any;
    const htmlConversion = await mammothAny.convertToHtml(
      { arrayBuffer: fileBuffer },
      {
        convertImage: mammothAny.images?.imgElement?.((image: any) => {
          return image.read('base64').then((imageBuffer: string) => {
            imgCounter++;
            const dataUrl = `data:${image.contentType};base64,${imageBuffer}`;
            extractedImagesList.push({
              id: `word_img_${imgCounter}`,
              dataUrl,
            });
            return {
              src: dataUrl,
              class: 'cbt-embedded-image',
              alt: `Gambar Soal ${imgCounter}`,
            };
          });
        }),
      }
    );

    const htmlContent = htmlConversion.value || '';

    // Associate images with question numbers by looking at HTML structure:
    // Match paragraphs, headings, list items, or table rows containing question numbers and images
    const questionBlockRegex =
      /(?:<p[^>]*>|<h\d[^>]*>|<tr[^>]*>|<li[^>]*>)(?:(?:soal|no\.?|nomor|pertanyaan|question)\s*(?:no\.?)?\s*(\d+)[\.\)\:\-]\s*|(\d+)[\.\)]\s*)([\s\S]*?)(?=(?:<p[^>]*>|<h\d[^>]*>|<tr[^>]*>|<li[^>]*>)(?:(?:soal|no\.?|nomor|pertanyaan|question)\s*(?:no\.?)?\s*\d+[\.\)\:\-]\s*|\d+[\.\)]\s*)|$)/gi;

    let match;
    while ((match = questionBlockRegex.exec(htmlContent)) !== null) {
      const qNumStr = match[1] || match[2];
      const qNum = parseInt(qNumStr, 10);
      const blockHtml = match[3];
      const imgMatch = blockHtml.match(/src="(data:image\/[^"]+)"/i);

      if (imgMatch && !isNaN(qNum)) {
        questionImageMap[qNum] = imgMatch[1];
        const found = extractedImagesList.find((img) => img.dataUrl === imgMatch[1]);
        if (found) {
          found.relatedQuestionNumber = qNum;
        }
      }
    }

    // Detect image references in text
    const imageKeywords = [
      'gambar',
      'diagram',
      'grafik',
      'tabel',
      'skema',
      'peta',
      'foto',
      '[gambar]',
      'figure',
    ];
    const lowerText = rawText.toLowerCase();
    const hasImageReferences = imageKeywords.some((kw) => lowerText.includes(kw));

    // Parse questions using the strict parser
    const questions = parseQuestionsFromRawText(rawText, {
      sourceFileName: fileName,
      sourceType: 'word',
      extractionMethod: 'mammoth_docx_structured',
      embeddedImagesMap: questionImageMap,
    });

    // Build internal RawDocument audit trail
    const paragraphs = rawText
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((text) => ({ text }));

    const rawDocument: RawDocument = {
      importId: `raw_word_${Date.now()}`,
      fileName,
      fileType: 'word',
      rawText,
      paragraphs,
      images: extractedImagesList,
      extractionMethod: 'mammoth_docx_structured',
      extractionWarnings: messages,
      extractedAt: new Date(),
    };

    return {
      questions,
      rawText,
      hasImageReferences,
      rawDocument,
      extractedImagesCount: extractedImagesList.length,
      messages,
    };
  } catch (error: any) {
    console.error('Word extraction error:', error);
    throw new Error(
      'Gagal mengekstrak teks dari dokumen Word (.docx): ' +
        (error.message || 'File corrupt atau format tidak didukung.')
    );
  }
}
