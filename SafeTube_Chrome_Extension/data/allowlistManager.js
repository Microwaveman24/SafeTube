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

//more effienct function to handle large amounts of data
export async function AllowChannel(all_ids) {
  for(const id of all_ids){
      await dbAdd(id);
    }
  chrome.runtime.sendMessage({ type: "resyncRules" });
}

export async function RemoveChannel(all_ids) {
  for(const id of all_ids){
      await dbRemove(id);
    }
  chrome.runtime.sendMessage({ type: "resyncRules" })
}