import {
  addAllowedVideo,
  removeAllowedVideo,
  getAllowedVideoIds,
  RemoveChannel
} from "./data/allowlistManager.js";



const input = document.getElementById("videoIdInput");
const addButton = document.getElementById("addButton");
const allowlistElement = document.getElementById("allowlist");
const pingButton = document.getElementById("pingButton")
const rmChannelButton = document.getElementById("rmChannel")


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

//add video
addButton.addEventListener("click", () => {
  const videoId = input.value.trim();
  if (videoId) {
    addAllowedVideo(videoId).then(() => {
      input.value = "";
      getAllowedVideoIds().then(renderAllowlist);
    });
  }
});


//ping button
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

function getVideoIdFromUrl(url) {
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

rmChannelButton.addEventListener("click",() => {
chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  const url = tabs[0].url;
  const videoId = getVideoIdFromUrl(url);
  
  const channel_ids = await getChannelIds(videoId)
  alert("channel data recived" + channel_ids)
  RemoveChannel(channel_ids)
  
});


})



async function getChannelIds(videoId) {
  try {
    const response = await fetch("http://localhost:5000/getChannelIds", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: "Extension pop-up page", id: videoId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    let all_ids =  data.message;  // This is what you want to return
    return all_ids
  } 
  catch (error) {
    console.error("Ping error:", error);
    alert("Failed to get the channel ids.");
    return null;
  }
}