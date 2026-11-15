#!/bin/bash
# One-time root setup for the fridge page. Run from SSH:  sudo bash ~/fridge/deploy/root-setup.sh
#
# What it does (nothing else on the box is touched):
#   - apt: python3-google-auth python3-requests apache2-utils nginx
#     (nginx is installed with auto-start blocked, its default :80 site removed,
#      so it never fights mc-dash/dash.py for port 80)
#   - nginx site on port $PORT only: /fridge/ -> $OUT_DIR, basic auth (user colin), X-Robots-Tag noindex
#   - $OUT_DIR owned by the repo user so fridge.py can write it
#   - fridge-sync.service/.timer with __USER__/__REPO__ filled, enabled, first run
#   - ufw allow $PORT/tcp
#   - loginctl enable-linger so the claude-rc user unit starts at boot
# Not touched: mc-dash (80/8765/8767), minecraft, tailscale funnel, port 8080.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 1; }
RUN_USER="${SUDO_USER:-colin}"
REPO="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
OUT_DIR=/var/www/fridge
PORT=8090
HTPASSWD=/etc/nginx/fridge.htpasswd
AUTH_USER=colin
echo "user=$RUN_USER repo=$REPO out=$OUT_DIR port=$PORT"

# Refuse to clash with anything already listening on our port.
if ss -Htln "sport = :$PORT" | grep -q . && ! ss -Htlnp "sport = :$PORT" | grep -q nginx; then
  echo "port $PORT is already in use by something other than nginx; edit PORT and rerun" >&2; exit 1
fi

# --- packages ------------------------------------------------------------------
# Block service auto-start during install: Debian's nginx would otherwise try :80 and fail.
POLICY=/usr/sbin/policy-rc.d
if [ ! -e "$POLICY" ]; then
  printf '#!/bin/sh\nexit 101\n' > "$POLICY"; chmod 755 "$POLICY"
  trap 'rm -f "$POLICY"' EXIT
fi
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  python3-google-auth python3-requests apache2-utils nginx
rm -f "$POLICY"; trap - EXIT

# Remove nginx's default :80 site (symlink only; the file stays in sites-available).
rm -f /etc/nginx/sites-enabled/default

# --- output dir --------------------------------------------------------------------
install -d -o "$RUN_USER" -g "$RUN_USER" -m 0755 "$OUT_DIR"

# --- nginx site ------------------------------------------------------------------
cat > /etc/nginx/sites-available/fridge <<EOF
# Fridge page. Separate port so the existing dash.py on :80 stays as is.
server {
    listen $PORT default_server;
    listen [::]:$PORT default_server;
    server_name fairyworldtree.duckdns.org _;
    server_tokens off;

    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;

    auth_basic "Fridge";
    auth_basic_user_file $HTPASSWD;

    location = / { return 302 /fridge/; }
    location = /robots.txt { auth_basic off; default_type text/plain; return 200 "User-agent: *\nDisallow: /\n"; }
    location /fridge/ {
        alias $OUT_DIR/;
        index index.html;
        location ~ /\. { deny all; }
        location ~ \.tmp\$ { deny all; }
        # (nginx drops server-level add_header once a location sets its own, so repeat them)
        add_header Cache-Control "no-cache" always;
        add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy no-referrer always;
    }
    location / { return 404; }
}
EOF
ln -sf /etc/nginx/sites-available/fridge /etc/nginx/sites-enabled/fridge

# --- password ---------------------------------------------------------------------
if [ -s "$HTPASSWD" ] && grep -q "^$AUTH_USER:" "$HTPASSWD"; then
  read -r -p "Password for '$AUTH_USER' already set. Change it? [y/N] " a
  [[ "$a" =~ ^[Yy] ]] && htpasswd -B "$HTPASSWD" "$AUTH_USER"
else
  echo "Choose the fridge page password for user '$AUTH_USER':"
  htpasswd -c -B "$HTPASSWD" "$AUTH_USER"
fi
chown root:www-data "$HTPASSWD"; chmod 640 "$HTPASSWD"

# --- test + (re)load nginx ------------------------------------------------------------
nginx -t
systemctl enable nginx
if systemctl is-active --quiet nginx; then systemctl reload nginx; else systemctl restart nginx; fi

# --- firewall ---------------------------------------------------------------------
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow "$PORT/tcp" comment 'fridge page (nginx)'
fi

# --- sync timer ------------------------------------------------------------------
for u in fridge-sync.service fridge-sync.timer; do
  sed -e "s|__USER__|$RUN_USER|g" -e "s|__REPO__|$REPO|g" "$REPO/deploy/$u" > "/etc/systemd/system/$u"
  chmod 644 "/etc/systemd/system/$u"
done
systemctl daemon-reload
systemctl enable --now fridge-sync.timer
systemctl start fridge-sync.service || { echo "first sync failed:"; journalctl -u fridge-sync.service -n 30 --no-pager; }

# --- linger so the claude-rc user unit starts at boot --------------------------------------
loginctl enable-linger "$RUN_USER"

echo
systemctl list-timers fridge-sync.timer --no-pager
ls -l "$OUT_DIR"
echo "Done. Local test: curl -u $AUTH_USER http://127.0.0.1:$PORT/fridge/"
