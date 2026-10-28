#!/bin/bash
# Double-click this file to start Deniz (website + dashboard).
# Close this window (or press Ctrl+C) to stop everything.

cd "$(dirname "$0")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# Stop both servers when this window is closed.
trap 'kill 0' EXIT

port_in_use() { lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

echo "🕯️  Starting Deniz..."

# First run only: create the dashboard account.
USERS=$(cd backend && source .venv/bin/activate && python -c "
from app import create_app
from app.extensions import db
from app.models import User
with create_app().app_context():
    print(db.session.scalar(db.select(db.func.count(User.id))))
" 2>/dev/null)
if [ "$USERS" = "0" ]; then
  echo ""
  echo "👋 First time! Let's create your dashboard account."
  echo "   (The password needs at least 8 characters. It stays invisible while you type.)"
  until (
    read -r -p "Choose a username: " NEW_USER
    cd backend && source .venv/bin/activate && flask --app app create-user "$NEW_USER"
  ); do
    echo "❌ The account was not created. Let's try again."
    echo ""
  done
  echo ""
fi

if port_in_use 5000; then
  echo "✓ Server already running"
else
  (cd backend && source .venv/bin/activate && flask --app app run --port 5000) &
fi

if port_in_use 5173; then
  echo "✓ Website already running"
else
  (cd frontend && npm run dev -- --port 5173 --strictPort) &
fi

# Wait until the website answers, then open the dashboard.
for _ in $(seq 1 60); do
  curl -s -o /dev/null http://localhost:5173 && break
  sleep 0.5
done
open "http://localhost:5173/admin"

echo ""
echo "✅ Deniz is running:"
echo "   Dashboard: http://localhost:5173/admin"
echo "   Website:   http://localhost:5173"
echo ""
echo "Keep this window open while you work. Close it to stop."
wait
