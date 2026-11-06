#!/usr/bin/env python3
"""Test concurrent saves and recovery against an isolated PocketBase database."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import logging
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from oauth_smoke import request

LOG = logging.getLogger('save-smoke')


def exercise(base, admin):
    def api(path, method='GET', data=None, token=admin, expected=200):
        return request(base, path, method, data, token, expected)
    assert api('/api/mtd/capabilities', token='') == {'mapRevisionWrites': 1, 'mapRecovery': 1, 'contentAwareSaving': 1}
    api('/api/settings', 'PATCH', {'rateLimits': {'enabled': False}})
    users = []
    for name in ['alice', 'bob', 'carol']:
        record = api('/api/collections/users/records', 'POST', {
            'email': name + '@example.test', 'name': name,
            'password': 'test-user-pass-123', 'passwordConfirm': 'test-user-pass-123'})
        token = api('/api/collections/users/auth-with-password', 'POST', {
            'identity': record['email'], 'password': 'test-user-pass-123'})['token']
        users.append((record['id'], token))
    (alice, ta), (bob, tb), (carol, tc) = users
    group = api('/api/collections/groups/records', 'POST', {'name': 'Test lab', 'owner': alice}, ta)['id']
    api('/api/collections/memberships/records', 'POST', {'group': group, 'user': bob, 'role': 'member'})
    doc = {'version': 1, 'title': 'Original', 'stations': [], 'edges': [], 'lines': [], 'sections': []}
    m = api('/api/collections/maps/records', 'POST', {'title': 'Original', 'doc': doc, 'owner': bob, 'editedBy': bob, 'group': group}, tb)
    path = '/api/mtd/maps/' + m['id']
    record_path = '/api/collections/maps/records/' + m['id']
    # Viewing and an identical save by another member preserve author, timestamp and revision.
    before_view = api(record_path, token=ta)
    reordered = dict(reversed(list(doc.items())))
    result = api(path + '/save', 'POST', {'revision': 0, 'doc': reordered}, ta)
    assert result['ok'] and result['revision'] == 0
    after_view = api(record_path, token=tb)
    for field in ['editedBy', 'updated', 'revision', 'doc']:
        assert after_view[field] == before_view[field], field
    LOG.info('Viewing and identical saves preserve last editor, timestamp and revision')
    # Both callers start from the same version. Exactly one wins on each round.
    revision = 0
    for round_no in range(12):
        def save(i):
            return api(path + '/save', 'POST', {'revision': revision, 'doc': {**doc, 'title': f'Round {round_no} writer {i}'}}, [ta, tb][i])
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(save, range(2)))
        assert sum(r['ok'] for r in results) == 1, results
        revision += 1
        actual = api(record_path, token=ta)
        assert actual['revision'] == revision
        winner = next(i for i, result in enumerate(results) if result['ok'])
        assert actual['doc']['title'] == f'Round {round_no} writer {winner}'
        assert actual['editedBy'] == [alice, bob][winner]
    LOG.info('12 simultaneous-save rounds: exactly one winner, no overwritten winner')
    api(path + '/save', 'POST', {'revision': revision, 'doc': doc}, tc, 404)
    api(path + '/restore', 'POST', {'revision': revision}, tc, 404)
    api(record_path, 'PATCH', {'title': 'Legacy overwrite'}, ta, 400)
    api(record_path, 'DELETE', token=ta, expected=400)
    assert not api(path + '/save', 'POST', {'revision': -1, 'doc': doc}, ta)['ok']
    LOG.info('Non-members and legacy direct writes cannot bypass safeguards')
    before = api(record_path, token=ta)
    assert api(path + '/trash', 'POST', {'revision': revision}, ta)['ok']
    revision += 1
    deleted = api(record_path, token=tb)
    assert deleted['deletedAt'] and deleted['doc'] == before['doc']
    assert deleted['editedBy'] == before['editedBy']
    assert not api(path + '/save', 'POST', {'revision': revision - 1, 'doc': doc}, tb)['ok']
    api(path + '/save', 'POST', {'revision': revision, 'doc': doc}, tb, 400)
    assert not api(path + '/restore', 'POST', {'revision': revision - 1}, tb)['ok']
    assert api(path + '/restore', 'POST', {'revision': revision}, tb)['ok']
    restored = api(record_path, token=ta)
    assert not restored['deletedAt'] and restored['doc'] == before['doc']
    assert restored['owner'] == bob and restored['group'] == group
    assert restored['editedBy'] == before['editedBy']
    LOG.info('Deletion rejects stale writers; restoration preserves content, owner and group')
    # A regular group member cannot delete or restore a different author's map.
    other = api('/api/collections/maps/records', 'POST', {'title': 'Owner map', 'doc': doc, 'owner': alice, 'group': group}, ta)
    other_path = '/api/mtd/maps/' + other['id']
    api(other_path + '/trash', 'POST', {'revision': 0}, tb, 403)
    api(other_path + '/restore', 'POST', {'revision': 0}, tb, 403)
    member = api('/api/collections/memberships/records')['items']
    member_id = next(x['id'] for x in member if x['user'] == bob)
    api('/api/collections/memberships/records/' + member_id, 'DELETE', expected=204)
    api(path + '/save', 'POST', {'revision': restored['revision'], 'doc': doc}, tb, 404)
    api(path + '/restore', 'POST', {'revision': restored['revision']}, tb, 404)
    LOG.info('Recovery respects group ownership and revoked membership')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pocketbase', type=Path, required=True, help='PocketBase executable; all test data is temporary')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(message)s')
    root = Path(__file__).resolve().parent
    with tempfile.TemporaryDirectory(prefix='mtd-save-smoke-') as folder:
        temp = Path(folder)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        base = f'http://127.0.0.1:{port}'
        common = [str(args.pocketbase.resolve()), f'--dir={temp / "data"}', f'--migrationsDir={root / "pb_migrations"}', f'--hooksDir={root / "pb_hooks"}']
        subprocess.run([common[0], 'superuser', 'upsert', 'admin@example.test', 'test-admin-pass-123', *common[1:]], check=True, stdout=subprocess.DEVNULL)
        with (temp / 'server.log').open('w+') as log:
            process = subprocess.Popen([common[0], 'serve', f'--http=127.0.0.1:{port}', '--hooksWatch=false', '--automigrate=false', *common[1:]], stdout=log, stderr=log)
            try:
                for _ in range(100):
                    try: request(base, '/api/health'); break
                    except OSError: time.sleep(.1)
                token = request(base, '/api/collections/_superusers/auth-with-password', 'POST', {'identity': 'admin@example.test', 'password': 'test-admin-pass-123'})['token']
                exercise(base, token)
            except Exception:
                log.flush(); log.seek(0)
                LOG.error('\n'.join(line for line in log.read().splitlines() if line.startswith(('ERROR', 'WARN', '└─'))))
                raise
            finally:
                process.terminate(); process.wait(timeout=10)
    LOG.info('Save and recovery checks passed; temporary database removed')

if __name__ == '__main__':
    main()
