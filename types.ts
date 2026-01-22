
export enum AppView {
  LANDING = 'landing',
  EDITOR = 'editor',
  MERGE = 'merge',
  SPLIT = 'split',
  CONVERT = 'convert', // PDF to Image
  SIGN = 'sign'
}

export interface PDFFile {
  id: string;
  file: File;
  name: string;
  size: number;
  previewUrl?: string;
}

export interface PDFActionResponse {
  success: boolean;
  data?: Uint8Array | Uint8Array[] | string[];
  error?: string;
}
