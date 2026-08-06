def test_boss_download_rejects_token_in_query(client, make_user):
    _, token = make_user("boss-query-rejected@example.com", role="recruiter")
    response = client.get(f"/api/boss/extension/download?token={token}")
    assert response.status_code == 401
    assert response.get_json()["error"] == "Missing token"


def test_boss_download_accepts_authorization_header(client, make_user):
    _, token = make_user("boss-query-org@example.com", role="recruiter", org_id=2)
    response = client.get(
        "/api/boss/extension/download",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
