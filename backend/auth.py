# backend/auth.py

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from models import db, User
from mailer import send_reset_code
import secrets # <--- CHANGED: Use secrets instead of random
import string
import os
import re 
from datetime import datetime, timedelta, timezone
import boto3 
from botocore.exceptions import NoCredentialsError 

auth_bp = Blueprint('auth', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# PASSWORD VALIDATOR
def is_strong_password(password):
    if len(password) < 8: return False
    if not re.search(r"[A-Z]", password): return False 
    if not re.search(r"[0-9]", password): return False 
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password): return False 
    return True

# SIGNUP ROUTE
@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    
    password = data['password']
    if not is_strong_password(password):
        return jsonify({
            "message": "Password too weak. Must be 8+ chars, with 1 uppercase, 1 number, and 1 symbol."
        }), 400

    if User.query.filter_by(email=data['email']).first():
        return jsonify({"message": "Email taken"}), 400
    
    user = User(
        email=data['email'], 
        name=data.get('name', ''),
        phone=data.get('phone', ''),
        timezone=data.get('timezone', 'UTC')
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify({"message": "Created"}), 201

# LOGIN ROUTE
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    user = User.query.filter_by(email=data['email']).first()
    
    if user and user.check_password(data['password']):
        token = create_access_token(identity=str(user.id))
        
        # === CLOUD COMPATIBILITY FIX ===
        # If the avatar is already a full URL (from S3), use it as is.
        # If it is a relative path (old local files), prepend static.
        avatar_url = user.avatar
        if avatar_url and not avatar_url.startswith('http') and not avatar_url.startswith('/'):
            avatar_url = f"/static/avatars/{user.avatar}"
        elif avatar_url and avatar_url.startswith('/'):
            avatar_url = user.avatar
        # If it starts with 'http', it's an S3 URL, so we leave it alone.

        return jsonify({
            "token": token,
            "user": {
                "name": user.name,
                "nickname": user.nickname,
                "avatar": avatar_url, 
                "email": user.email,
                "phone": user.phone,
                "timezone": user.timezone
            }
        })
    return jsonify({"message": "Invalid credentials"}), 401

# UPDATE PROFILE ROUTE (AWS S3 IMPLEMENTED)
@auth_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user: return jsonify({"message": "User not found"}), 404
    
    if 'name' in request.form: user.name = request.form['name']
    if 'nickname' in request.form: user.nickname = request.form['nickname']
    if 'phone' in request.form: user.phone = request.form['phone']
    if 'timezone' in request.form: user.timezone = request.form['timezone']
    
    if 'new_password' in request.form and request.form['new_password']:
        new_pass = request.form['new_password']
        if not is_strong_password(new_pass):
            return jsonify({"message": "Password too weak."}), 400
        user.set_password(new_pass)

    # === AWS S3 UPLOAD LOGIC ===
    if 'avatar' in request.files:
        file = request.files['avatar']
        if file and allowed_file(file.filename):
            # 1. Create a safe filename
            filename = secure_filename(f"user_{user_id}_{file.filename}")

            # 2. Add the folder path (This creates the "avatars" folder automatically)
            s3_key = f"avatars/{filename}"

            # 1. Get Credentials from Environment
            s3_access_key = os.environ.get('AWS_ACCESS_KEY_ID')
            s3_secret_key = os.environ.get('AWS_SECRET_ACCESS_KEY')
            s3_bucket = os.environ.get('AWS_BUCKET_NAME')
            s3_region = os.environ.get('AWS_REGION')

            if not all([s3_access_key, s3_secret_key, s3_bucket, s3_region]):
                return jsonify({"message": "Server S3 configuration missing"}), 500

            # 2. Initialize S3 Client
            s3 = boto3.client(
                's3',
                aws_access_key_id=s3_access_key,
                aws_secret_access_key=s3_secret_key,
                region_name=s3_region
            )

            try:
                # 3. Upload File to S3
                # 'ACL': 'public-read' makes it visible to the browser
                # 'ContentType' ensures the browser knows it's an image, not a download
                s3.upload_fileobj(
                    file,
                    s3_bucket,
                    s3_key,  # This is the "filename" in the bucket, including the folder path
                    ExtraArgs={
                        "ACL": "public-read",
                        "ContentType": file.content_type
                    }
                )

                # 4. Save the FULL Public URL to the Database including the folder 
                user.avatar = f"https://{s3_bucket}.s3.{s3_region}.amazonaws.com/{s3_key}"

            except Exception as e:
                print(f"S3 Upload Error: {e}")
                return jsonify({"message": "Failed to upload image to cloud"}), 500

    db.session.commit()
    return jsonify({"message": "Profile updated", "avatar": user.avatar})

# FORGOT PASSWORD 
@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    data = request.get_json()
    user = User.query.filter_by(email=data['email']).first()
    
    if not user:
        return jsonify({"message": "If that email exists, a code has been sent."}), 200
    
    # FIXED: Use SECRETS instead of RANDOM for secure code generation
    code = ''.join(secrets.choice(string.digits) for _ in range(6))
    
    user.reset_token = code
    user.reset_token_expiry = datetime.now(timezone.utc) + timedelta(minutes=15)
    db.session.commit()
    
    send_reset_code(user.email, code)
    return jsonify({"message": "Reset code sent"}), 200

# RESET PASSWORD
@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json()
    user = User.query.filter_by(email=data['email']).first()
    
    if not user or user.reset_token != data['code']:
        return jsonify({"message": "Invalid code"}), 400
        
    if user.reset_token_expiry.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        return jsonify({"message": "Code expired"}), 400
    
    new_pass = data['new_password']
    if not is_strong_password(new_pass):
        return jsonify({"message": "Password too weak."}), 400

    user.set_password(new_pass)
    user.reset_token = None
    user.reset_token_expiry = None
    db.session.commit()
    
    return jsonify({"message": "Password reset successfully"}), 200