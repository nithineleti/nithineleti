from __future__ import annotations

from pydantic import BaseModel, Field, HttpUrl


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=256)


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    repo_url: HttpUrl
    default_branch: str = Field(default="main", min_length=1, max_length=80)


class RunCreate(BaseModel):
    bug_report: str = Field(min_length=12, max_length=12000)
