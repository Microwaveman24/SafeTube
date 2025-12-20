from flask import Blueprint, request, jsonify
from models import db, ParentUser, ChildAccount, AllowedVideo, VideoRequest, DevicePairing
from flask_jwt_extended import (
jwt_required,
get_jwt_identity
)
import secrets
from datetime import datetime, timedelta


dash_bp = Blueprint("dash", __name__)


#return child data and other useful things
@dash_bp.route("/main_data", methods = ['POST', "OPTIONS"])
@jwt_required(optional=True)
def main_data():
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
        "children": [
            {
                "id" : c.id,
                "name" : c.name
            } for c in children],
        "parent_email" : parent.email
    })
    return packet


@dash_bp.route("generate_pair_code", methods=['POST'])
@jwt_required()
def generate_pair_code():
    data = request.get_json()
    child_id = data.get("child_id")
    code = secrets.token_hex(3).upper()

    expires = datetime.utcnow() + timedelta(minutes = 10)

    pair = DevicePairing(
        code = code,
        child_id=child_id,
        expires_at=expires
    )
    db.session.add(pair)
    db.session.commit()

    return jsonify({"code" : code})

#other dashboard commands will go here


    
