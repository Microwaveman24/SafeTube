from flask import Blueprint, request, jsonify
from models import db, ParentUser, ChildAccount, AllowedVideo, VideoRequest
from flask_jwt_extended import (
jwt_required,
get_jwt_identity
)
dash_bp = Blueprint("dash", __name__)


#return child data and other useful things
@dash_bp.route("/main_data", methods = ['POST', "OPTIONS"])
@jwt_required(optional=True)
def main_data():

    print("AUTH HEADER:", request.headers.get("Authorization"))

    if request.method == "OPTIONS":
        return "", 200 
    

    user_id = int(get_jwt_identity())

    if not user_id:
        return jsonify({"msg": "Unauthorized"}), 401
    
    parent = ParentUser.query.get(user_id)
    children = parent.children
    #need to stil request video things in the future

    #eventually will fix this to include video requests and other things
    packet = jsonify({
        "children": [c.name for c in children],
        "parent_email" : parent.email
    })
    return packet




#other dashboard commands will go here


    
