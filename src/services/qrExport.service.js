import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { pngBase64, qrFilename } from '../utils/qrExport';

export async function shareQR({ dataUrl, identifier }) {
  const data = pngBase64(dataUrl);
  if (!await Sharing.isAvailableAsync()) throw new Error('Compartir archivos no está disponible en este dispositivo');
  if (!FileSystem.cacheDirectory) throw new Error('No se pudo preparar el archivo QR');
  const directory = `${FileSystem.cacheDirectory}qr/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const uri = `${directory}${qrFilename(identifier)}`;
  await FileSystem.writeAsStringAsync(uri, data, { encoding: FileSystem.EncodingType.Base64 });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: `Compartir QR · ${identifier}` });
}

export async function saveQR({ dataUrl, identifier }) {
  const data = pngBase64(dataUrl);
  const saf = FileSystem.StorageAccessFramework;
  const permission = await saf.requestDirectoryPermissionsAsync();
  if (!permission.granted) return;
  const uri = await saf.createFileAsync(permission.directoryUri, qrFilename(identifier), 'image/png');
  await FileSystem.writeAsStringAsync(uri, data, { encoding: FileSystem.EncodingType.Base64 });
}

export const printQR = undefined;
