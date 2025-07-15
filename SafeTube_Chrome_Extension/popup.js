import {
  addAllowedVideo,
  removeAllowedVideo,
  getAllowedVideoIds,
} from "./data/allowlistManager.js";

const input = document.getElementById("videoIdInput");
const addButton = document.getElementById("addButton");
const allowlistElement = document.getElementById("allowlist");

function renderAllowlist(allowedIds) {
  allowlistElement.innerHTML = "";
  allowedIds.forEach((id) => {
    const li = document.createElement("li");
    li.textContent = id;

    const removeButton = document.createElement("button");
    removeButton.textContent = "Remove";
    removeButton.onclick = () => {
      removeAllowedVideo(id).then(() => getAllowedVideoIds().then(renderAllowlist));
    };

    li.appendChild(removeButton);
    allowlistElement.appendChild(li);
  });
}

addButton.addEventListener("click", () => {
  const videoId = input.value.trim();
  if (videoId) {
    addAllowedVideo(videoId).then(() => {
      input.value = "";
      getAllowedVideoIds().then(renderAllowlist);
    });
  }
});

getAllowedVideoIds().then(renderAllowlist);
