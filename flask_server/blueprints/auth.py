from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, ParentUser, ChildAccount
from datetime import timedelta
from flask_jwt_extended import (
create_access_token,
jwt_required,
get_jwt_identity
)
auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/signup", methods=['POST'])
def signup():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"success": False, "message": "Missing username or password"}), 400

    if ParentUser.query.filter_by(email=email).first():
        
        return jsonify({"error": "Email already registered"}), 400
    
    hashed_password = generate_password_hash(password)
    new_user = ParentUser(email = email, password_hash = hashed_password)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"success": True, "message": "Signup successful"}), 201


#how do they keep the credentails
@auth_bp.route('/login', methods=['POST'])
def login_api():
    """
    Authenticate parent and issue JWT access token.
    """
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    parent = ParentUser.query.filter_by(email=email).first()
    if not parent or not check_password_hash(parent.password_hash, password):
        return jsonify({'error': 'Invalid credentials'}), 401
    access_token = create_access_token(identity=str(parent.id))

    return jsonify({
        'access_token': access_token,
        'parent_id': parent.id
    }), 200

@auth_bp.route("/create_child", methods=['POST'])
@jwt_required()
def create_child():
    data = request.get_json()
    parent_id = int(get_jwt_identity())
    name = data.get("name")

    parent = ParentUser.query.get(parent_id)
    if not parent:
        return jsonify({"error": "Parent not found"}), 404
    
    new_child = ChildAccount(name=name, parent=parent)
    db.session.add(new_child)
    db.session.commit()

    return jsonify({"message": "Child account created"}), 201

@auth_bp.route("/remove_child/<int:child_id>", methods=["DELETE"])
@jwt_required()
def remove_child(child_id):
    parent_id = int(get_jwt_identity())
    child = ChildAccount.query.get(child_id)

    if not child or child.parent_id != parent_id:
        return jsonify({"error": "Unauthorized"}), 403

    db.session.delete(child)
    db.session.commit()
    return jsonify({"message": "Child removed"})
