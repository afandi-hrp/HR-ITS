import React, { useEffect, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set worker path to local file to avoid CDN dynamic import issues
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

interface PdfToImagesProps {
  url: string;
  title: string;
}

export const PdfToImages: React.FC<PdfToImagesProps> = ({ url, title }) => {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const loadPdf = async () => {
      try {
        setLoading(true);
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        const imageUrls: string[] = [];

        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 }); // High res for printing
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          if (context) {
            await page.render({ canvasContext: context, viewport: viewport }).promise;
            imageUrls.push(canvas.toDataURL('image/png'));
          }
        }

        if (isMounted) {
          setImages(imageUrls);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error rendering PDF:', err);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => { isMounted = false; };
  }, [url]);

  if (loading) return <div className="text-sm text-slate-500 italic animate-pulse">Memuat dokumen PDF ({title})...</div>;
  if (error) return <div className="text-sm text-red-500 italic">Gagal memuat dokumen PDF. <a href={url} target="_blank" rel="noreferrer" className="underline text-indigo-600">Buka manual</a></div>;

  return (
    <div className="space-y-6">
      {images.map((imgSrc, index) => (
        <div key={index} className="pdf-avoid-break">
          {images.length > 1 && <h4 className="font-semibold text-slate-600 mb-2 text-sm">{title} - Halaman {index + 1}</h4>}
          <img src={imgSrc} alt={`${title} Page ${index + 1}`} className="max-w-full h-auto border border-slate-200 p-2 rounded-lg" />
        </div>
      ))}
    </div>
  );
};
