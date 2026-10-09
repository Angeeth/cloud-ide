import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

def test_auth_and_project_flow():
    unique_email = f"alex_{uuid.uuid4().hex[:6]}@mirage.ide"
    
    # 1. Register User 1 (Owner)
    reg_data = {
        "name": "Alex Owner",
        "email": unique_email,
        "password": "Password123!"
    }
    res = client.post("/api/auth/register", json=reg_data)
    assert res.status_code == 201
    user1_id = res.json()["id"]

    # 2. Login User 1
    login_res = client.post("/api/auth/login", json={"email": unique_email, "password": "Password123!"})
    assert login_res.status_code == 200
    token1 = login_res.json()["access_token"]
    headers1 = {"Authorization": f"Bearer {token1}"}

    # 3. Get /me
    me_res = client.get("/api/users/me", headers=headers1)
    assert me_res.status_code == 200
    assert me_res.json()["email"] == unique_email

    # 4. Create Project with C language
    proj_res = client.post("/api/projects", json={
        "name": "C Low-Level App",
        "description": "Test C collaborative app",
        "language": "c"
    }, headers=headers1)
    assert proj_res.status_code == 201
    project_id = proj_res.json()["id"]

    # 5. List Files Tree
    files_res = client.get(f"/api/projects/{project_id}/files", headers=headers1)
    assert files_res.status_code == 200
    files = files_res.json()
    assert len(files) > 0

    # 6. Execute C Code
    exec_res = client.post("/api/execute", json={"project_id": project_id}, headers=headers1)
    assert exec_res.status_code == 200
    exec_data = exec_res.json()
    assert exec_data["status"] == "SUCCESS"
    assert "Welcome to Mirage IDE" in exec_data["stdout"]

    # 7. Create Project Version Snapshot
    hist_res = client.post(f"/api/projects/{project_id}/history", json={"description": "Initial C Version"}, headers=headers1)
    assert hist_res.status_code == 201
    assert hist_res.json()["version_number"] == 1

def test_clone_github_validation():
    unique_email = f"gituser_{uuid.uuid4().hex[:6]}@mirage.ide"
    client.post("/api/auth/register", json={"name": "Git User", "email": unique_email, "password": "Password123!"})
    login_res = client.post("/api/auth/login", json={"email": unique_email, "password": "Password123!"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Test invalid repo URL handling
    res = client.post("/api/projects/clone-github", json={"repo_url": "https://github.com/invalid_repo_name_9999/does_not_exist.git"}, headers=headers)
    assert res.status_code == 400
