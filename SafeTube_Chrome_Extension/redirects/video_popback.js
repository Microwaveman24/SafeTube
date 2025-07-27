import {
  addAllowedVideo,
  removeAllowedVideo,
  AllowChannel,
} from "../data/allowlistManager.js";

const addChannel = document.getElementById("AllowChannel")
const addVideo = document.getElementById("AllowVideo")
const yt_homepage = document.getElementById("Homepage")
const urlParams = new URLSearchParams(window.location.search);
const videoId = urlParams.get("videoId");


addChannel.addEventListener("click", () => {
    AllowChannelbyID(videoId)
})


addVideo.addEventListener("click", () => {
  addAllowedVideo(videoId)
})

yt_homepage.addEventListener("click", () => {
  window.location.href = "https://youtube.com";
})

function AllowChannelbyID(videoId){
  fetch("http://localhost:5000/getChannelIds", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from: "Extension Allow Channel Button", id : videoId})
  })
  .then(response => response.json())
  .then(data => {
    let all_ids = data.message
    //function relates to the larger local DB
    AllowChannel(all_ids);
  })
  .catch(error => {
      console.error("Ping error:", error);
      alert("Failed to get the channel ids.");
    });
}