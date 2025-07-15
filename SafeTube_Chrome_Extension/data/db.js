export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("YouTubeAccessDB", 1);
    request.onupgradeneeded = function (event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("allowedVideos")) {
        db.createObjectStore("allowedVideos", { keyPath: "videoId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
