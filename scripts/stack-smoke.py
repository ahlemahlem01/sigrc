"""Smoke test of the running Docker Compose stack (read only apart from the login).
Usage: SEED_ADMIN_PASSWORD=... python scripts/stack-smoke.py
Waits for the stack, signs in as admin@coficab.com, and calls the Action Plan API with that token,
which proves that both APIs agree on the token issuer and that the database is migrated."""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

AUTH, API, WEB, ML = 'http://127.0.0.1:5119', 'http://127.0.0.1:5129', 'http://127.0.0.1:3001', 'http://127.0.0.1:' + os.environ.get('ML_PORT', '8001')


def call(url, token=None, form=None):
    headers = {'Authorization': 'Bearer ' + token} if token else {}
    data = urllib.parse.urlencode(form).encode() if form else None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except OSError:
        return 0, b''


def wait(name, url, ok=200, seconds=240):
    end = time.time() + seconds
    while time.time() < end:
        if call(url)[0] == ok:
            print(f'OK   {name}')
            return
        time.sleep(5)
    sys.exit(f'FAIL {name}: no {ok} from {url} after {seconds} s')


wait('Auth API ready (migration + seed done)', AUTH + '/health/ready')
wait('Action Plan API alive', API + '/health')
wait('Frontend served', WEB + '/')
wait('ML service up', ML + '/docs')

status, raw = call(AUTH + '/connect/token', form={
    'grant_type': 'password', 'username': 'admin@coficab.com', 'password': os.environ['SEED_ADMIN_PASSWORD'],
    'client_id': 'coficab-frontend', 'scope': 'openid offline_access email profile roles action-plan-api'})
if status != 200:
    sys.exit(f'FAIL sign in: {status}')
token = json.loads(raw)['access_token']
print('OK   sign in')

failed = False
for name, path, expected in [('workflow (token accepted by Action Plan API)', '/api/workflow/claims', 200),
                             ('reference lists', '/api/reference-lists', 200),
                             ('claims list', '/api/QualityAnalysis/claims?page=1&pageSize=5', 200),
                             ('KPI (Dapper on SQL Server)', '/api/kpi/claims?months=12', 200)]:
    status, _ = call(API + path, token)
    print(('OK   ' if status == expected else 'FAIL ') + f'{name} -> {status}')
    failed |= status != expected
status, _ = call(API + '/api/kpi/claims')
print(('OK   ' if status == 401 else 'FAIL ') + f'no token is refused -> {status}')
failed |= status != 401
sys.exit(1 if failed else 0)
