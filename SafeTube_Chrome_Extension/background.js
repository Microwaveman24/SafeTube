import { getAllowedVideoIds } from "./data/allowlistManager.js";

function hashId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

async function syncAllowedVideosToDNR() {
  const videoIds = await getAllowedVideoIds();
  const rules = videoIds.map(videoId => ({
    id: 1000 + hashId(videoId),
    priority: 1,
    action: { type: "allow" },
    condition: {
      urlFilter: `*://www.youtube.com/watch?v=${videoId}`,
      resourceTypes: ["main_frame"]
    }
  }));

  const ruleIds = rules.map(rule => rule.id);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ruleIds,
    addRules: rules
  });
}

chrome.runtime.onStartup.addListener(syncAllowedVideosToDNR);
chrome.runtime.onInstalled.addListener(syncAllowedVideosToDNR);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "resyncRules") {
    syncAllowedVideosToDNR().then(() => sendResponse({ status: "ok" }));
    return true;
  }

  //for content.js script for in window switches
  if (message.type === "isVideoAllowed") {
    getAllowedVideoIds().then((ids) => {
      sendResponse(ids.includes(message.videoId));
    });
    console.log("Does this work?");
    return true;
  }
});
