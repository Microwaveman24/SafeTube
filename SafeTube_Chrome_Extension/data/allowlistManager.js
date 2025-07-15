import {
  listAllowedVideos,
  addAllowedVideo as dbAdd,
  removeAllowedVideo as dbRemove,
} from "./dbFunctions.js";
//works with the rules in the extension
export async function getAllowedVideoIds() {
  return await listAllowedVideos();
}

export async function addAllowedVideo(videoId) {
  await dbAdd(videoId);
  chrome.runtime.sendMessage({ type: "resyncRules" });
}

export async function removeAllowedVideo(videoId) {
  await dbRemove(videoId);
  chrome.runtime.sendMessage({ type: "resyncRules" });
}
