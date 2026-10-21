from setuptools import setup, find_packages

setup(
    name="mirage-shared",
    version="1.0.0",
    description="Common shared utilities and schemas for Mirage IDE microservices",
    packages=find_packages(),
    install_requires=[
        "fastapi",
        "pydantic",
        "pydantic-settings",
        "python-jose[cryptography]",
        "passlib[bcrypt]",
        "bcrypt"
    ]
)
