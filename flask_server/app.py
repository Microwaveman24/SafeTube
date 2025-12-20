from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from yt_function import get_all_channel_videos_from_video
from models import db , ParentUser, ChildAccount, AllowedVideo, DevicePairing, VideoRequest
from dotenv import load_dotenv
from flask_jwt_extended import JWTManager

import os


app = Flask(__name__)
CORS(app)
load_dotenv()  # loads variables from .env


#secure in the os.
DATABASE_URL = os.getenv('DATABASE_URL')
JWT_KEY = os.getenv('JWT_KEY')

#Config Stuffs
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL 
app.config["JWT_SECRET_KEY"] = JWT_KEY  # for JWT signing
app.secret_key=os.getenv('SECRET_KEY')
db.init_app(app)

#stuff to do with merging db
from flask_migrate import Migrate
migrate = Migrate(app, db)

#init JWT token stuffs

app.config["JWT_TOKEN_LOCATION"] = ["headers"]
app.config["JWT_COOKIE_CSRF_PROTECT"] = False
jwt = JWTManager(app)

#import blue prints
from blueprints.auth import auth_bp
from blueprints.dash import dash_bp
#register blue prints
app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(dash_bp, url_prefix="/api/dash")

@app.route("/ping", methods = ['POST'])
def ping():
    data = request.json
    video_id = data['id']
    if not video_id:
        return jsonify({"error": "Missing video ID"}), 400
    all_ids = get_all_channel_videos_from_video(video_id)
    return jsonify({"message" : "Pong from flask","videoids" : all_ids })


@app.route("/")
def home():
    return render_template("signup.html")


@app.route("/login", methods=['GET'])
def login_page():
    return render_template("login.html")

@app.route("/create_child")
def create_child():
    return render_template("createchild.html")

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


#this can go into a different blueprint at some point
@app.route("/getChannelIds", methods=['POST'])
def allowchannel():
    data = request.json
    video_id = data['id']
    if not video_id:
        return jsonify({"error": "Missing video ID"}), 400
    all_ids = get_all_channel_videos_from_video(video_id)
    return jsonify({"message" : all_ids})


if __name__ == "__main__":
    # with app.app_context():
    #     db.create_all()
    app.run(port = 5000, debug = True)



    
