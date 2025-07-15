function getVideoIdFromUrl(url) {
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}


lastVideoId = null;
let lasturl = location.href

async function checkAndRedirect() {
  const videoId = getVideoIdFromUrl(location.href);

  if(!videoId) return;
  if(videoId === lastVideoId) return;

  lastVideoId = videoId

  try {
    const isAllowed = await chrome.runtime.sendMessage({
      type: "isVideoAllowed",
      videoId: videoId
    });

    if (!isAllowed) {
      console.log(`[YouTube Blocker] Blocking video ${videoId}`);
      window.location.replace(chrome.runtime.getURL("request.html"));
    }
  } catch (err) {
    console.error("Error checking allowlist:", err);
  }
}
//this works however it doesn't activate when a link is clicked
document.body.addEventListener("mouseup", function(event) {
    console.log("Action detected!")


    setTimeout( () => {
    checkAndRedirect();
    console.log("URL is checked");
}, 200); // 2000 milliseconds = 2 seconds
    
});