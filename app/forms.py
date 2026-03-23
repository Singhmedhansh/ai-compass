from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, TextAreaField
from wtforms.validators import DataRequired, Email, Length, URL, Optional
from marshmallow import Schema, fields, validate, post_load

# ----- WTForms for Template Integration -----

class LoginForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired(), Length(min=8)])

class RegisterForm(FlaskForm):
    email = StringField('Email', validators=[DataRequired(), Email()])
    password = PasswordField('Password', validators=[DataRequired(), Length(min=8)])

class ToolSubmissionForm(FlaskForm):
    name = StringField('Tool Name', validators=[DataRequired(), Length(max=255)])
    website = StringField('Website', validators=[DataRequired(), URL()])
    category = StringField('Category', validators=[DataRequired()])
    description = TextAreaField('Description', validators=[DataRequired()])

# ----- Marshmallow Schemas for API/JSON Validation -----

class ToolSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=2, max=255))
    link = fields.Url(required=True)
    description = fields.Str(required=True)
    category = fields.Str(required=True)
    tags = fields.List(fields.Str())
    price = fields.Str(validate=validate.OneOf(["free", "freemium", "paid"]), missing="free")
    student_perk = fields.Bool(missing=False)

    @post_load
    def sanitize_input(self, data, **kwargs):
        # Additional HTML sanitization hook
        for key, val in data.items():
            if isinstance(val, str):
                data[key] = val.strip().replace('<', '&lt;').replace('>', '&gt;')
        return data
