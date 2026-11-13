export function pngBase64(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(dataUrl)) {
    throw new Error('No se pudo generar una imagen PNG válida del QR');
  }
  return dataUrl.slice('data:image/png;base64,'.length);
}

export function qrFilename(identifier) {
  return `QR-${String(identifier).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 100) || 'recurso'}.png`;
}

export function qrPrintDocument({ dataUrl, identifier }) {
  pngBase64(dataUrl);
  const label = String(identifier).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR ${label}</title><style>
    @page { margin: 20mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: white; color: black; font: 16pt sans-serif; }
    main { display: flex; flex-direction: column; align-items: center; padding-top: 15mm; text-align: center; }
    img { width: 65mm; height: 65mm; padding: 5mm; background: white; image-rendering: pixelated; }
    p { margin: 5mm 0 0; overflow-wrap: anywhere; }
  </style></head><body><main><img src="${dataUrl}" alt="Código QR"><p>${label}</p></main></body></html>`;
}
