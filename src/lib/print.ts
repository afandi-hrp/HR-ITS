import html2pdf from 'html2pdf.js';

export const printElement = async (element: HTMLElement | null, title: string = 'Document') => {
  if (!element) return;

  try {
    // Open a new window for native printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error("POPUP_BLOCKED");
    }

    const clone = element.cloneNode(true) as HTMLElement;

    // Transform inputs into text elements for perfect printing and selectable text
    const inputs = clone.querySelectorAll('input, textarea, select');
    inputs.forEach((input: any) => {
      const textNode = document.createElement('div');
      
      // Keep original classes for layout, but override styles for print clarity
      textNode.className = input.className;
      
      // We want to keep the background and border so it looks like a form field
      // but we need to ensure it displays the text correctly
      textNode.style.color = '#0f172a'; // slate-900
      textNode.style.fontWeight = '400';
      textNode.style.whiteSpace = 'pre-wrap'; // for textareas
      textNode.style.minHeight = input.tagName === 'TEXTAREA' ? '80px' : '42px';
      textNode.style.display = 'flex';
      textNode.style.alignItems = input.tagName === 'TEXTAREA' ? 'flex-start' : 'center';
      textNode.style.overflow = 'hidden';
      
      if (input.tagName === 'SELECT') {
        textNode.innerText = input.options[input.selectedIndex]?.text || '-';
      } else if (input.type === 'checkbox' || input.type === 'radio') {
        textNode.innerText = input.checked ? '☑' : '☐';
        textNode.style.display = 'inline-flex';
        textNode.style.width = 'auto';
        textNode.style.minHeight = 'auto';
        textNode.style.fontSize = '1.25rem';
        textNode.style.background = 'transparent';
        textNode.style.border = 'none';
        textNode.style.padding = '0';
      } else {
        textNode.innerText = input.value || '-';
      }

      input.parentNode?.replaceChild(textNode, input);
    });

    // Get all stylesheets from the parent window
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(s => s.outerHTML)
      .join('\n');

    // Add specific styles to fix page breaks and hide UI elements
    const printStyles = `
      <style>
        @media print {
          @page { margin: 15mm; size: A4 portrait; }
          body { 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
            background: white !important;
          }
          /* Prevent page breaks inside rows and avoid cutting text */
          tr, td, th, .pdf-avoid-break { 
            page-break-inside: avoid !important; 
            break-inside: avoid !important; 
          }
          h1, h2, h3, h4, h5, h6 { 
            page-break-after: avoid !important; 
            break-after: avoid !important; 
          }
          /* Ensure backgrounds print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box !important;
          }
          /* Hide UI elements not meant for print */
          button, .no-print { display: none !important; }
          /* Keep the same width the on-screen preview uses (A4 printable width),
             instead of stretching to the print window's actual (often much wider)
             viewport — stretching then shrinks back down when paginated to A4,
             which is what made downloaded PDFs look smaller/different than the preview. */
          #application-form-container, .max-w-4xl {
            max-width: 180mm !important;
            width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          /* Prevent any element from overflowing the page width */
          body {
            max-width: 100% !important;
            overflow-x: hidden !important;
          }
          /* Force the form header title onto a single line at a size guaranteed to
             fit within the fixed 180mm print width, regardless of which responsive
             text-size class (sm:/md:/print:) would otherwise win the cascade. */
          #application-form-title {
            font-size: 15px !important;
            letter-spacing: normal !important;
            white-space: nowrap !important;
          }
          #application-form-subtitle {
            font-size: 11px !important;
            white-space: nowrap !important;
          }
          img, svg, canvas, video, iframe {
            max-width: 100% !important;
            max-height: 240mm !important;
            object-fit: contain !important;
          }
          .grid {
            /* Sometimes grid causes overflow in print, fallback to block or ensure it fits */
            max-width: 100% !important;
          }
        }
      </style>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          ${styles}
          ${printStyles}
        </head>
        <body class="bg-white">
          ${clone.outerHTML}
          <script>
            window.onload = () => {
              // Wait for all images to load before printing
              const images = Array.from(document.images);
              const imagePromises = images.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                  img.onload = resolve;
                  img.onerror = resolve;
                });
              });

              Promise.all(imagePromises).then(() => {
                setTimeout(() => {
                  window.print();
                }, 500); // Small buffer for rendering
              });
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

export const generatePdfBlob = async (element: HTMLElement | null, title: string = 'Document'): Promise<Blob | null> => {
  if (!element) return null;

  try {
    const clone = element.cloneNode(true) as HTMLElement;

    // Transform inputs into text elements for perfect printing
    const inputs = clone.querySelectorAll('input, textarea, select');
    inputs.forEach((input: any) => {
      const textNode = document.createElement('div');
      textNode.className = input.className;
      textNode.style.color = '#0f172a';
      textNode.style.fontWeight = '400';
      textNode.style.whiteSpace = 'pre-wrap';
      textNode.style.minHeight = input.tagName === 'TEXTAREA' ? '80px' : '42px';
      textNode.style.display = 'flex';
      textNode.style.alignItems = input.tagName === 'TEXTAREA' ? 'flex-start' : 'center';
      textNode.style.overflow = 'hidden';
      
      if (input.tagName === 'SELECT') {
        textNode.innerText = input.options[input.selectedIndex]?.text || '-';
      } else if (input.type === 'checkbox' || input.type === 'radio') {
        textNode.innerText = input.checked ? '☑' : '☐';
        textNode.style.display = 'inline-flex';
        textNode.style.width = 'auto';
        textNode.style.minHeight = 'auto';
        textNode.style.fontSize = '1.25rem';
        textNode.style.background = 'transparent';
        textNode.style.border = 'none';
        textNode.style.padding = '0';
      } else {
        textNode.innerText = input.value || '-';
      }

      input.parentNode?.replaceChild(textNode, input);
    });

    // We need to temporarily append the clone to the body so html2pdf can read its computed styles
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '794px'; // A4 width at 96 DPI (210mm) to prevent right margin cutoff
    container.appendChild(clone);
    document.body.appendChild(container);

    const opt = {
      margin:       10,
      filename:     `${title}.pdf`,
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false, windowWidth: 794 },
      jsPDF:        { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
    };

    const pdfBlob = await html2pdf().from(clone).set(opt).output('blob');
    
    // Cleanup
    document.body.removeChild(container);
    
    return pdfBlob;
  } catch (error) {
    console.error('Error generating PDF Blob:', error);
    return null;
  }
};
