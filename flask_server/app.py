from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from yt_function import get_all_channel_videos_from_video
from flask_sqlalchemy import SQLAlchemy
from models import db , ParentUser, ChildAccount, AllowedVideo
from dotenv import load_dotenv
from flask_jwt_extended import JWTManager, get_jwt_identity, jwt_required
import os

#blueprints also wacky way to show a ensted directory 
from blueprints.auth import auth_bp

app = Flask(__name__)
CORS(app)
load_dotenv()  # loads variables from .env
app.register_blueprint(auth_bp, url_prefix="/api/auth")

#secure in the os.
DATABASE_URL = os.getenv('DATABASE_URL')
JWT_KEY = os.getenv('JWT_KEY')

#Config Stuffs
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config["JWT_SECRET_KEY"] = JWT_KEY  # for JWT signing
app.secret_key=os.getenv('SECRET_KEY')
db.init_app(app)

#init JWT token stuffs
#give different logins different tokens ex api from extension has 7 day and can request more time 
jwt = JWTManager(app)



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

@app.route("/api/dashboard")
@jwt_required()
def dashboard_data():
    parent_id = get_jwt_identity()
    parent = ParentUser.query.get(parent_id)

    return jsonify({
        "children": [c.name for c in parent.children]
    })



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



    
