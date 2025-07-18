import {
  addAllowedVideo,
  removeAllowedVideo,
  getAllowedVideoIds,
} from "./data/allowlistManager.js";

const input = document.getElementById("videoIdInput");
const addButton = document.getElementById("addButton");
const allowlistElement = document.getElementById("allowlist");
const pingButton = document.getElementById("pingButton")

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

pingButton.addEventListener("click", handlePing)

function handlePing(){
  fetch("http://localhost:5000/ping", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    //hardcoded id for the moment jsut to test.
    body: JSON.stringify({ from: "Extension Ping Button" ,  id : "FWAdfuPpLOc"})
  })
    .then(response => response.json())
    .then(data => {
      alert("Server response: " + data.message);
    })
    .catch(error => {
      console.error("Ping error:", error);
      alert("Failed to ping server.");
    });
}
getAllowedVideoIds().then(renderAllowlist);
