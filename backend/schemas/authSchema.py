from pydantic import BaseModel, Field, ValidationError, ValidationInfo, field_validator, AfterValidator, BeforeValidator
from typing import Annotated, Any
import re

class AuthValidators:
    @staticmethod
    def strip_string(v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @staticmethod
    def validate_password(v: str) -> str:
        if len(v) == 0:
            raise ValueError("Le mot de passe est requis.")
        if len(v) < 8:
            raise ValueError("Le mot de passe doit contenir au moins 8 caractères.")
        if not re.search(r'[A-Z]', v):
            raise ValueError("Le mot de passe doit contenir au moins une lettre majuscule.")
        if not re.search(r'[a-z]', v):
            raise ValueError("Le mot de passe doit contenir au moins une lettre minuscule.")
        if not re.search(r'[0-9]', v):
            raise ValueError("Le mot de passe doit contenir au moins un chiffre.")
        if not re.search(r'[!@#$%^&*(),.?":{}|<>_]', v):
            raise ValueError("Le mot de passe doit contenir au moins un caractère spécial.")
        return v

    @staticmethod
    def validate_username(v: str) -> str:
        if len(v) == 0:
            raise ValueError("Le nom d'utilisateur est requis.")
        if len(v) < 3:
            raise ValueError("Le nom d'utilisateur doit avoir au moins 3 caractères.")
        if len(v) > 20:
            raise ValueError("Le nom d'utilisateur doit avoir au maximum 20 caractères.")
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError("Le nom d'utilisateur ne peut contenir que des lettres, des chiffres et des tirets bas.")
        return v

    @staticmethod
    def validate_fullname(v: str) -> str:
        if len(v) == 0:
            raise ValueError("Le nom complet est requis.")
        if len(v) < 3:
            raise ValueError("Le nom complet doit avoir au moins 3 caractères.")
        if len(v) > 50:
            raise ValueError("Le nom complet doit avoir au maximum 50 caractères.")
        if not re.match(r'^[a-zA-Z\s]+$', v):
            raise ValueError("Le nom complet ne peut contenir que des lettres et des espaces.")
        return v

    @staticmethod
    def validate_confirmpassword(v: str, info: ValidationInfo) -> str:
        if len(v) == 0:
            raise ValueError("La confirmation du mot de passe est requise.")
        if 'password' in info.data and v != info.data['password']:
            raise ValueError("Les mots de passe ne correspondent pas.")
        return v

ValidatedPassword = Annotated[str, BeforeValidator(AuthValidators.strip_string), AfterValidator(AuthValidators.validate_password)]

ValidatedUsername = Annotated[str, BeforeValidator(AuthValidators.strip_string), AfterValidator(AuthValidators.validate_username)]

ValidatedFullname = Annotated[str, BeforeValidator(AuthValidators.strip_string), AfterValidator(AuthValidators.validate_fullname)]

ValidatedConfirmPassword = Annotated[str, BeforeValidator(AuthValidators.strip_string), AfterValidator(AuthValidators.validate_confirmpassword)]

class LoginSchema(BaseModel):
    username: ValidatedUsername 
    password: ValidatedPassword

class RegisterSchema(BaseModel):
    fullname: ValidatedFullname
    username: ValidatedUsername
    password: ValidatedPassword
    confirmPassword: ValidatedConfirmPassword
    registertype: str

