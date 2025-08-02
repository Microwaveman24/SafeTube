from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class ParentUser(db.Model):
    __tablename__ = "parent_users"
    id = db.Column(db.Integer, primary_key = True)
    email = db.Column(db.String, unique=True, nullable=False)
    password_hash = db.Column(db.String, nullable=False)

    children = db.relationship('ChildAccount', back_populates='parent')

class ChildAccount(db.Model):
    __tablename__ = 'child_accounts'
    id = db.Column(db.Integer, primary_key = True)
    name = db.Column(db.String, unique=True)
    parent_id = db.Column(db.Integer, db.ForeignKey('parent_users.id'), nullable = False)

    #relating back to 
    parent = db.relationship('ParentUser', back_populates='children')
    allowed_videos = db.relationship('AllowedVideo', back_populates='child')
    video_requests = db.relationship('VideoRequest', back_populates='child')

class AllowedVideo(db.Model):
    __tablename__ = 'allowed_videos'
    id = db.Column(db.Integer, primary_key = True)
    video_id = db.Column(db.String, nullable = False)
    child_id = db.Column(db.Integer, db.ForeignKey('child_accounts.id'), nullable = False)

    child = db.relationship('ChildAccount', back_populates='allowed_videos')


#list of video requests with differential between channel request or video request
class VideoRequest(db.Model):
    __tablename__ = 'video_requests'
    id = db.Column(db.Integer ,primary_key = True)
    request_id = db.Column(db.String, nullable = False) #this can be a video id or a channel id
    is_channel = db.Column(db.Boolean, default = False) #True is channel, False is justa video id
    timestamp = db.Column(db.DateTime, default=db.func.now())

    child_id = db.Column(db.Integer, db.ForeignKey('child_accounts.id'), nullable = False)
    child = db.relationship('ChildAccount', back_populates='video_requests')

#things to add approved channels, and seperate approved video lists, AI responses, chached channel contents