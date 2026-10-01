"""Remove only the exact local fixture accounts supplied by browser tests."""
import json
import re
import sqlite3
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
database = root / 'backend/instance/tengeflow.sqlite3'
emails = sys.argv[1:]
pattern = r'tengeflow-e2e-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@example\.test'
if not emails or any(not re.fullmatch(pattern, email) for email in emails):
    raise SystemExit('Cleanup requires exact generated E2E fixture emails.')
if not database.is_file():
    raise SystemExit('Local test database is missing.')
with sqlite3.connect(database) as connection:
    connection.execute('PRAGMA foreign_keys=ON')
    for email in emails:
        connection.execute('DELETE FROM users WHERE email = ?', (email,))
for path in (root / 'backend/instance/outbox').glob('*.json'):
    message = json.loads(path.read_text())
    if message.get('to') in emails:
        path.unlink()
print('Exact local E2E fixtures removed.')
