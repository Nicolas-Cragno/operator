import { pngBase64, qrFilename, qrPrintDocument } from '../utils/qrExport';

export function saveQR({ dataUrl, identifier }) {
  pngBase64(dataUrl);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = qrFilename(identifier);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function shareQR(image) {
  pngBase64(image.dataUrl);
  const blob = await (await fetch(image.dataUrl)).blob();
  const file = new File([blob], qrFilename(image.identifier), { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try { await navigator.share({ files: [file], title: image.identifier }); }
    catch (error) { if (error.name !== 'AbortError') throw error; }
  } else saveQR(image);
}

export function printQR(image) {
  const html = qrPrintDocument(image);
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.title = 'Imprimir código QR';
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
    let timeout;
    const cleanup = () => { clearTimeout(timeout); frame.remove(); };
    frame.onload = async () => {
      try {
        const qr = frame.contentDocument.querySelector('img');
        await qr.decode();
        const target = frame.contentWindow;
        if (!target?.print) throw new Error('La impresión no está disponible en este navegador');
        clearTimeout(timeout);
        target.onafterprint = cleanup;
        target.focus();
        target.print();
        resolve();
      } catch (error) { cleanup(); reject(error); }
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
    timeout = setTimeout(() => { cleanup(); reject(new Error('No se pudo abrir la impresión del QR')); }, 30000);
  });
}
