
import { PDFDocument, degrees } from 'pdf-lib';
import { PDFActionResponse } from '../types';
import * as pdfjsLib from 'pdfjs-dist';

/**
 * myPDF Local Engine - 100% Privacy
 */

export const mergePDFs = async (files: File[]): Promise<PDFActionResponse> => {
  try {
    if (files.length === 0) return { success: false, error: "No files to merge" };
    const mergedPdf = await PDFDocument.create();
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }
    const mergedPdfBytes = await mergedPdf.save();
    return { success: true, data: mergedPdfBytes };
  } catch (e: any) {
    return { success: false, error: "Merge failed: " + e.message };
  }
};

export const rotatePDF = async (file: File, rotation: number): Promise<PDFActionResponse> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pages = pdfDoc.getPages();
    pages.forEach(page => {
      page.setRotation(degrees(page.getRotation().angle + rotation));
    });
    return { success: true, data: await pdfDoc.save() };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const splitPDF = async (file: File, pageIndices: number[]): Promise<PDFActionResponse> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const sourcePdf = await PDFDocument.load(arrayBuffer);
    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
    copiedPages.forEach((page) => newPdf.addPage(page));
    return { success: true, data: await newPdf.save() };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const compressPDF = async (file: File): Promise<PDFActionResponse> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    return { success: true, data: pdfBytes };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const convertToImages = async (file: File): Promise<PDFActionResponse> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images: Uint8Array[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 }); 
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (context) {
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (blob) images.push(new Uint8Array(await blob.arrayBuffer()));
      }
    }
    return { success: true, data: images };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const applySignature = async (
  file: File, 
  signatureDataUrl: string, 
  pageNum: number, 
  x: number, 
  y: number,
  width: number = 150
): Promise<PDFActionResponse> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    const page = pdfDoc.getPages()[pageNum - 1];
    
    const sigBytes = await fetch(signatureDataUrl).then((res) => res.arrayBuffer());
    const sigImage = signatureDataUrl.includes('image/png') ? await pdfDoc.embedPng(sigBytes) : await pdfDoc.embedJpg(sigBytes);

    const { width: imgW, height: imgH } = sigImage.scaleToFit(width, width);

    page.drawImage(sigImage, {
      x: x - (imgW / 2),
      y: page.getHeight() - y - (imgH / 2),
      width: imgW,
      height: imgH,
    });

    return { success: true, data: await pdfDoc.save() };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};
