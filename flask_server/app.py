from flask import Flask, jsonify, request
from flask_cors import CORS
from yt_function import get_all_channel_videos_from_video
app = Flask(__name__)
CORS(app)

#sucesessful ping to extension
@app.route("/ping", methods = ['POST'])
def ping():
    data = request.json
    video_id = data['id']
    if not video_id:
        return jsonify({"error": "Missing video ID"}), 400
    all_ids = get_all_channel_videos_from_video(video_id)
    return jsonify({"message" : "Pong from flask","videoids" : all_ids})

@app.route("/getChannelIds", methods=['POST'])
def allowchannel():
    data = request.json
    video_id = data['id']
    if not video_id:
        return jsonify({"error": "Missing video ID"}), 400
    all_ids = get_all_channel_videos_from_video(video_id)
    return jsonify({"message" : all_ids})


if __name__ == "__main__":
    app.run(port = 5000, debug = True)


    
