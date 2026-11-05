#!/usr/bin/env python3
"""Exercise real PocketBase OAuth account matching against local provider fixtures."""
import argparse
import contextlib
import json
import logging
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOG = logging.getLogger("oauth-smoke")
IDENTITIES = {}


class Provider(BaseHTTPRequestHandler):
    """Serve Google and GitHub responses without contacting either service."""

    def log_message(self, *_args):
        pass

    def reply(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        form = urllib.parse.parse_qs(self.rfile.read(int(self.headers["Content-Length"])).decode())
        code = form.get("code", [""])[0]
        self.reply(200, {"access_token": code, "token_type": "Bearer", "expires_in": 3600})

    def do_GET(self):
        identity = IDENTITIES.get(self.headers.get("Authorization", "").removeprefix("Bearer "))
        if not identity:
            self.reply(401, {"error": "invalid_token"})
        elif self.path == "/google":
            self.reply(200, {"sub": identity["id"], "email": identity["email"],
                             "email_verified": identity.get("verified", True), "name": "Test Member"})
        elif self.path == "/github/emails":
            self.reply(200, [{"email": identity["email"], "verified": identity.get("verified", True), "primary": True}])
        elif self.path == "/github":
            self.reply(200, {"id": int(identity["id"]), "login": "test-member", "name": "Test Member"})
        else:
            self.reply(404, {})


def request(base, path, method="GET", data=None, token="", expected=200):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = token
    req = urllib.request.Request(base + path, method=method, headers=headers,
                                 data=None if data is None else json.dumps(data).encode())
    try:
        response = urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read()
        result = json.loads(body) if body else None
        if response.status != expected:
            # Test identities only; never print authentication tokens or OAuth responses.
            raise AssertionError(f"{method} {path}: expected {expected}, got {response.status}: {result.get('message', '') if isinstance(result, dict) else ''}")
        return result


def exercise(base, mock, admin_token):
    def api(path, method="GET", data=None, token=admin_token, expected=200):
        return request(base, path, method, data, token, expected)

    collection = api("/api/collections/users")
    api("/api/collections/users", "PATCH", {"oauth2": {
        "enabled": True, "mappedFields": {"name": "name"}, "providers": [
            {"name": name, "clientId": "local-test-client", "clientSecret": "local-test-secret",
             "authURL": mock + "/authorize", "tokenURL": mock + "/token", "userInfoURL": mock + "/" + name}
            for name in ["google", "github"]]}})
    api("/api/settings", "PATCH", {"rateLimits": {"enabled": False}})
    owner = api("/api/collections/users/records", "POST", {
        "email": "owner@example.test", "password": "test-owner-pass-123", "passwordConfirm": "test-owner-pass-123",
        "name": "Test Owner", "admin": True, "verified": True})
    owner_auth = request(base, "/api/collections/users/auth-with-password", "POST", {
        "identity": owner["email"], "password": "test-owner-pass-123"})["token"]
    group = api("/api/collections/groups/records", "POST", {"name": "OAuth test group", "owner": owner["id"]}, owner_auth)
    invite = api("/api/collections/signups/records", "POST", {
        "createdBy": owner["id"], "group": group["id"], "maxUses": 3}, owner_auth)

    def oauth(provider, identity, email, invite_code=None, verified=True, expected=200):
        code = f"fixture-{len(IDENTITIES)}"
        IDENTITIES[code] = {"id": identity, "email": email, "verified": verified}
        body = {"provider": provider, "code": code, "codeVerifier": "local-verifier",
                "redirectURL": base + "/api/oauth2-redirect"}
        if invite_code:
            body["createData"] = {"inviteCode": invite_code}
        return request(base, "/api/collections/users/auth-with-oauth2", "POST", body, expected=expected)

    first = oauth("github", "1001", "shared@example.test", invite["code"])
    assert first["meta"]["isNew"] and not first["record"]["admin"]
    user_id = first["record"]["id"]
    personal = api("/api/collections/maps/records", "POST", {
        "owner": user_id, "title": "Private OAuth test", "doc": {"version": 1, "title": "Private OAuth test"}}, first["token"])
    second = oauth("google", "google-one", "SHARED@EXAMPLE.TEST")
    assert second["record"]["id"] == user_id and not second["meta"]["isNew"]
    assert api(f"/api/collections/maps/records/{personal['id']}", token=second["token"])["owner"] == user_id
    members = api("/api/collections/memberships/records")
    assert any(m["user"] == user_id and m["group"] == group["id"] for m in members["items"])
    assert len(api(f"/api/collections/signups/records/{invite['id']}")["usedBy"]) == 1
    LOG.info("same verified email: one account, original maps and group, no extra invitation use")

    other = oauth("google", "google-two", "different@example.test", invite["code"])
    assert other["record"]["id"] != user_id and other["meta"]["isNew"]
    api(f"/api/collections/maps/records/{personal['id']}", token=other["token"], expected=404)
    assert len(api(f"/api/collections/signups/records/{invite['id']}")["usedBy"]) == 2
    LOG.info("different email: separate account, no access to another account's private maps")

    reverse = oauth("google", "google-first", "reverse@example.test", invite["code"])
    reverse_github = oauth("github", "1002", "REVERSE@EXAMPLE.TEST")
    assert reverse_github["record"]["id"] == reverse["record"]["id"]
    assert len(api(f"/api/collections/signups/records/{invite['id']}")["usedBy"]) == 3
    LOG.info("Google-first and GitHub-first accounts both match the same verified email")

    for provider, identity in [("google", "google-one"), ("github", "1001")]:
        changed = oauth(provider, identity, "different@example.test")
        assert changed["record"]["id"] == user_id and changed["record"]["email"] == "shared@example.test"
    LOG.info("provider email changes: both existing identities still reach the original account")

    oauth("google", "no-invite", "uninvited@example.test", expected=400)
    oauth("google", "invalid-invite", "invalid@example.test", "invalid-code", expected=400)
    oauth("google", "unverified", "shared@example.test", invite["code"], verified=False, expected=400)
    oauth("github", "1003", "shared@example.test", invite["code"], verified=False, expected=400)
    oauth("google", "used-invite", "used@example.test", invite["code"], expected=400)
    api(f"/api/collections/signups/records/{invite['id']}", "PATCH", {"maxUses": 4, "expires": "2000-01-01 00:00:00.000Z"})
    oauth("google", "expired-invite", "expired@example.test", invite["code"], expected=400)
    assert api("/api/collections/users/records")["totalItems"] == 4
    LOG.info("missing/invalid/used/expired invitation and unverified matching email: no new account or merge")
    query = urllib.parse.urlencode({"filter": f"recordRef = '{user_id}'"})
    links = api(f"/api/collections/_externalAuths/records?{query}")["items"]
    assert sorted(link["provider"] for link in links) == ["github", "google"]
    LOG.info("both sign-in identities remain linked to one record")
    assert collection["id"] == first["record"]["collectionId"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pocketbase", type=Path, required=True, help="Path to the PocketBase executable; use the version in server/Dockerfile")
    parser.add_argument("--verbose", action="store_true", help="Include the temporary server log if a check fails")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    root = Path(__file__).resolve().parent
    with tempfile.TemporaryDirectory(prefix="mtd-oauth-fixtures-") as directory:
        temp = Path(directory)
        with contextlib.closing(socket.socket()) as port_socket:
            port_socket.bind(("127.0.0.1", 0))
            port = port_socket.getsockname()[1]
        base = f"http://127.0.0.1:{port}"
        common = [str(args.pocketbase.resolve()), f"--dir={temp / 'data'}", f"--migrationsDir={root / 'pb_migrations'}", f"--hooksDir={root / 'pb_hooks'}"]
        subprocess.run([common[0], "superuser", "upsert", "admin@example.test", "test-admin-pass-123", *common[1:]],
                       check=True, stdout=subprocess.DEVNULL)
        with (temp / "server.log").open("w+") as log, ThreadingHTTPServer(("127.0.0.1", 0), Provider) as mock:
            threading.Thread(target=mock.serve_forever, daemon=True).start()
            process = subprocess.Popen([common[0], "serve", f"--http=127.0.0.1:{port}", "--hooksWatch=false", "--automigrate=false", *(["--dev"] if args.verbose else []), *common[1:]], stdout=log, stderr=log)
            try:
                for _ in range(100):
                    try:
                        request(base, "/api/health")
                        break
                    except (OSError, AssertionError):
                        if process.poll() is not None:
                            raise RuntimeError("Temporary PocketBase exited before startup")
                        time.sleep(0.1)
                else:
                    raise RuntimeError("Temporary PocketBase did not start")
                token = request(base, "/api/collections/_superusers/auth-with-password", "POST", {
                    "identity": "admin@example.test", "password": "test-admin-pass-123"})["token"]
                exercise(base, f"http://127.0.0.1:{mock.server_port}", token)
            except Exception:
                if args.verbose:
                    log.flush(); log.seek(0)
                    errors = [line for line in log.read().splitlines() if line.startswith(("ERROR", "WARN", "└─"))]
                    LOG.error("Temporary server errors:\n%s", "\n".join(errors))
                raise
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill(); process.wait()
                mock.shutdown()
    LOG.info("OAuth integration checks passed; temporary database removed")


if __name__ == "__main__":
    main()
