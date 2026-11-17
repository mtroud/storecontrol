import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { storage } from '../lib/firebase';

export type StorageFolder = 'devices' | 'consumables' | 'entries' | 'maintenance';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface UploadedFileMetadata {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export function validateAssetAttachment(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'حجم الملف يتجاوز الحد الأقصى المسموح به (10 ميجابايت).';
  }
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';
  if (!isImage && !isPdf) {
    return 'نوع الملف غير مدعوم. يُسمح بالصور وملفات PDF فقط.';
  }
  return null;
}

export async function uploadAssetAttachment(
  folder: StorageFolder,
  entityId: string,
  file: File
): Promise<UploadedFileMetadata> {
  const validationError = validateAssetAttachment(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storagePath = `${folder}/${entityId}/${safeName}`;
  const fileRef = ref(storage, storagePath);

  await uploadBytes(fileRef, file, {
    contentType: file.type,
  });

  const downloadUrl = await getDownloadURL(fileRef);
  return {
    downloadUrl,
    storagePath,
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  };
}

export async function deleteAssetAttachment(storagePath: string): Promise<void> {
  const fileRef = ref(storage, storagePath);
  await deleteObject(fileRef);
}
