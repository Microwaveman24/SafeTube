from googleapiclient.discovery import build
from dotenv import load_dotenv
import os

# More secure API storage I do believe
API_KEY = os.getenv('YOUTUBE_API')

def get_channel_id_from_video(video_id, youtube):
    response = youtube.videos().list(
        part='snippet',
        id=video_id
    ).execute()
    
    if not response['items']:
        raise ValueError(f"No video found with ID {video_id}")
    
    return response['items'][0]['snippet']['channelId']

def get_uploads_playlist_id(channel_id, youtube):
    response = youtube.channels().list(
        part='contentDetails',
        id=channel_id
    ).execute()

    if not response['items']:
        raise ValueError(f"No channel found with ID {channel_id}")
    
    return response['items'][0]['contentDetails']['relatedPlaylists']['uploads']

def get_all_video_ids_from_playlist(playlist_id, youtube):
    video_ids = []
    next_page_token = None

    while True:
        response = youtube.playlistItems().list(
            part='contentDetails',
            playlistId=playlist_id,
            maxResults=50,
            pageToken=next_page_token
        ).execute()

        for item in response['items']:
            video_ids.append(item['contentDetails']['videoId'])

        next_page_token = response.get('nextPageToken')
        if not next_page_token:
            break

    return video_ids

def get_all_channel_videos_from_video(video_id):
    youtube = build('youtube', 'v3', developerKey=API_KEY)
    
    channel_id = get_channel_id_from_video(video_id, youtube)
    uploads_playlist_id = get_uploads_playlist_id(channel_id, youtube)
    video_ids = get_all_video_ids_from_playlist(uploads_playlist_id, youtube)
    
    return video_ids

# Example usage:
if __name__ == '__main__':
    test_video_id = 'FWAdfuPpLOc'  # Replace with any YouTube video ID
    all_video_ids = get_all_channel_videos_from_video(test_video_id)
    print(all_video_ids)
