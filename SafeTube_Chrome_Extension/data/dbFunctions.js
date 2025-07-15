import { openDB } from "./db.js";

export async function addAllowedVideo(videoId) {
  const db = await openDB();
  const tx = db.transaction("allowedVideos", "readwrite");
  const store = tx.objectStore("allowedVideos");
  await store.put({ videoId });
  await tx.done;
}

export async function removeAllowedVideo(videoId) {
  const db = await openDB();
  const tx = db.transaction("allowedVideos", "readwrite");
  const store = tx.objectStore("allowedVideos");
  await store.delete(videoId);
  await tx.done;
}

export async function listAllowedVideos() {
  const db = await openDB();
  const tx = db.transaction("allowedVideos", "readonly");
  const store = tx.objectStore("allowedVideos");
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      const videoIds = request.result.map(item => item.videoId);
      resolve(videoIds);
    };
    request.onerror = () => reject(request.error);
  });
}
