from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, ParentUser, ChildAccount

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/signup", methods=['POST'])
def signup():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    if ParentUser.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 400
    
    hashed_password = generate_password_hash(password)
    new_user = ParentUser(email = email, password_hash = hashed_password)
    db.session.add(new_user)
    db.session.commit

    return jsonify({"message": "Parent account created!"}), 201

#how do they keep the credentails
@auth_bp.route("/login", methods=['POST'])
def login():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    user = ParentUser.query.filter_by(email=email).first()
    if user and check_password_hash(user.password_hash, password):
        return jsonify({"message": "Login successful", "parent_id": user.id}), 200
    return jsonify({"error": "Invalid credentials"}), 401


@auth_bp.route("/create_child", methods=['POST'])
def create_child():
    data = request.get_json
    parent_id = data.get("parent_id")
    name = data.get("name")

    parent = ParentUser.query.get(parent_id)
    if not parent:
        return jsonify({"error": "Parent not found"}), 404
    
    new_child = ChildAccount(name=name, parent=parent)
    db.session.add(new_child)
    db.session.commit()

    return jsonify({"message": "Child account created"}), 201


