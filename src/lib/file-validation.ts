export type DetectedDocumentType = 'application/pdf' | 'image/png' | 'image/jpeg';

export const detectDocumentType = (bytes: Uint8Array): DetectedDocumentType => {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  throw new Error('unsupported_file_signature');
};

export const validateResumePdf = async (file: File) => {
  if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new Error('invalid_resume_size');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (detectDocumentType(bytes) !== 'application/pdf') throw new Error('resume_must_be_pdf');
  return bytes;
};

export const validateEmployerDocument = async (file: File) => {
  if (file.size < 1 || file.size > 10 * 1024 * 1024) {
    throw new Error('invalid_employer_document_size');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedType = detectDocumentType(bytes);
  return { bytes, detectedType };
};
