'use strict';
/**
 * Optional YouTube Data API enrichment: fills in a request's title/channel
 * when the extension didn't supply them. Best-effort — never throws, never
 * blocks the request. Everything works fine without YOUTUBE_API_KEY.
 */

const logger = require('../logger');
const { config } = require('../config');

async function enrich(videoId) {
  if (!config.youtubeApiKey) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const url =
      'https://www.googleapis.com/youtube/v3/videos?part=snippet&id=' +
      encodeURIComponent(videoId) +
      '&key=' +
      encodeURIComponent(config.youtubeApiKey);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const item = data && data.items && data.items[0];
    if (!item || !item.snippet) return null;
    return {
      title: item.snippet.title || '',
      channelId: item.snippet.channelId || '',
      channelTitle: item.snippet.channelTitle || '',
    };
  } catch (err) {
    logger.debug('[youtube] enrichment failed:', err.message);
    return null;
  }
}

module.exports = { enrich };
