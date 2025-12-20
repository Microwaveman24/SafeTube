import {
  addAllowedVideo,
  removeAllowedVideo,
  getAllowedVideoIds,
  RemoveChannel
} from "./data/allowlistManager.js";

/* ================= CONFIG ================= */
const API_BASE = "http://127.0.0.1:5000/api";

/* ================= DOM ================= */
const pairScreen = document.getElementById("pairScreen");
const mainScreen = document.getElementById("mainScreen");
const pairBtn = document.getElementById("pairBtn");
const pairCodeInput = document.getElementById("pairCodeInput");
const pairStatus = document.getElementById("pairStatus");
const childLabel = document.getElementById("childLabel");

const input = document.getElementById("videoIdInput");
const addButton = document.getElementById("addButton");
const allowlistElement = document.getElementById("allowlist");
const rmChannelButton = document.getElementById("rmChannelButton");

/* ================= STORAGE ================= */
function getPairing() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ["paired", "device_token", "child_name"],
      resolve
    );
  });
}

function setPairing(data) {
  return new Promise(resolve => {
    chrome.storage.local.set(data, resolve);
  });
}

/* ================= UI STATE ================= */
async function initPopup() {
  const { paired, child_name } = await getPairing();

  if (paired) {
    pairScreen.classList.add("hidden");
    mainScreen.classList.remove("hidden");
    childLabel.textContent = `Connected as: ${child_name}`;
  } else {
    pairScreen.classList.remove("hidden");
    mainScreen.classList.add("hidden");
  }

  getAllowedVideoIds().then(renderAllowlist);
}

/* ================= PAIRING ================= */
pairBtn.addEventListener("click", async () => {
  const code = pairCodeInput.value.trim();
  if (!code) return;

  pairStatus.textContent = "Connecting...";

  try {
    const res = await fetch(`${API_BASE}/auth/device/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.Error || "Pairing failed");

    await setPairing({
      paired: true,
      device_token: data.device_token,
      child_name: data.child_name
    });

    pairStatus.textContent = "Connected!";
    await initPopup();

  } catch (err) {
    pairStatus.textContent = err.message;
  }
});

/* ================= ALLOWLIST ================= */
function renderAllowlist(allowedIds) {
  allowlistElement.innerHTML = "";

  allowedIds.forEach(id => {
    const li = document.createElement("li");
    li.textContent = id;

    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.onclick = () => {
      removeAllowedVideo(id).then(() =>
        getAllowedVideoIds().then(renderAllowlist)
      );
    };

    li.appendChild(btn);
    allowlistElement.appendChild(li);
  });
}

addButton.addEventListener("click", () => {
  const videoId = input.value.trim();
  if (!videoId) return;

  addAllowedVideo(videoId).then(() => {
    input.value = "";
    getAllowedVideoIds().then(renderAllowlist);
  });
});

/* ================= CHANNEL BLOCK ================= */
function getVideoIdFromUrl(url) {
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

rmChannelButton.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
    const videoId = getVideoIdFromUrl(tabs[0].url);
    if (!videoId) return;

    const channelIds = await getChannelIds(videoId);
    if (channelIds) RemoveChannel(channelIds);
  });
});

async function getChannelIds(videoId) {
  try {
    const res = await fetch("http://localhost:5000/getChannelIds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: videoId })
    });

    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    return data.message;
  } catch {
    alert("Failed to get channel IDs");
    return null;
  }
}

/* ================= START ================= */
document.addEventListener("DOMContentLoaded", initPopup);
