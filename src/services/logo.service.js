import { getDownloadURL, getStorage, ref } from "firebase/storage";
import { firebaseApp } from "../firebase/client";
export async function resolveLogo(uri) {
  if (!uri) return null;
  if (uri.startsWith("https://")) return uri;
  if (!uri.startsWith("gs://")) return null;
  try { return await getDownloadURL(ref(getStorage(firebaseApp), uri)); }
  catch { return null; }
}
