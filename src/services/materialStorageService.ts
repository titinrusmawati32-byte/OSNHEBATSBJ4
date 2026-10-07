import { 
  ref, 
  uploadBytes,
  uploadBytesResumable, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { storage } from '../lib/firebase';

export interface UploadProgress {
  progress: number;
  status: 'idle' | 'uploading' | 'success' | 'error';
  error?: string;
  downloadUrl?: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

export const materialStorageService = {
  /**
   * Fast, reliable PDF uploader.
   * Tries direct upload to Firebase Storage with automatic fast fallback to Data URL for instant completion.
   */
  uploadMaterialPdf: async (
    subjectId: string,
    materialId: string,
    file: File,
    onProgress: (progress: number) => void
  ): Promise<string> => {
    onProgress(15);

    // 1. Prepare fast Data URL in memory for instant fallback
    let dataUrlBackup = '';
    try {
      if (file.size <= 12 * 1024 * 1024) {
        dataUrlBackup = await fileToDataUrl(file);
      }
    } catch (e) {
      console.warn('Data URL conversion error:', e);
    }

    onProgress(35);

    // 2. Try fast direct upload to Firebase Storage with 3.5 second timeout
    try {
      const storageRef = ref(storage, `materials/${subjectId}/${materialId}/document.pdf`);

      const uploadPromise = (async () => {
        const snap = await uploadBytes(storageRef, file, {
          contentType: 'application/pdf',
        });
        return await getDownloadURL(snap.ref);
      })();

      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Storage upload timeout')), 3500);
      });

      const downloadUrl = await Promise.race([uploadPromise, timeoutPromise]);
      onProgress(100);
      return downloadUrl;
    } catch (err) {
      console.warn('Firebase Storage upload timed out or failed; falling back to instant inline document store:', err);
      if (dataUrlBackup) {
        onProgress(100);
        return dataUrlBackup;
      }
      throw err;
    }
  },

  /**
   * Deletes a PDF from Firebase Storage
   */
  deleteMaterialPdf: async (subjectId: string, materialId: string) => {
    const storageRef = ref(storage, `materials/${subjectId}/${materialId}/document.pdf`);
    try {
      await deleteObject(storageRef);
    } catch (error: any) {
      if (error.code !== 'storage/object-not-found') {
        console.error('Storage delete error:', error);
      }
    }
  },

  /**
   * Gets the download URL for a file path
   */
  getMaterialDownloadUrl: async (path: string) => {
    const storageRef = ref(storage, path);
    return getDownloadURL(storageRef);
  }
};
