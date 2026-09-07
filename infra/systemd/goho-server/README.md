# Goho server

This unit targets the existing `adam` user and checkout at
`/home/adam/github.com/adamaho/goho`. Install pnpm `12.3.4` with the standalone
installer's `PNPM_VERSION` option, use it to install Node.js `24.15.0`, and run
`pnpm install --frozen-lockfile` as `adam` before starting or restarting the
service. Frozen installation validates both the lockfile and the repository's
release-age policy; do not use `--trust-lockfile` or disable the frozen lockfile.
The private `@adamaho` packages require a user-level GitHub Packages token with
`read:packages`; keep that credential out of the checkout and remove temporary
auth files after installation.

Run the bootstrap as `adam`. The prompt keeps the token out of shell history,
and the trap removes the temporary auth file even if installation fails.

```bash
cd /home/adam/github.com/adamaho/goho
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME/bin:$PATH"
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12.3.4 ENV="$HOME/.bashrc" SHELL=/bin/bash sh -
pnpm runtime set node 24.15.0 --global
read -rsp 'GitHub Packages token: ' NODE_AUTH_TOKEN && printf '\n'
export NODE_AUTH_TOKEN
npm_user_config="$(mktemp)"
trap 'rm -f "$npm_user_config"; unset NODE_AUTH_TOKEN' EXIT
chmod 0600 "$npm_user_config"
printf '%s\n' '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}' > "$npm_user_config"
NPM_CONFIG_USERCONFIG="$npm_user_config" pnpm install --frozen-lockfile
rm -f "$npm_user_config"
unset NODE_AUTH_TOKEN
trap - EXIT
```

```bash
sudo install -d -o root -g adam -m 0750 /etc/goho
sudo install -o root -g adam -m 0640 infra/systemd/goho-server/.env.example /etc/goho/server.env
sudo install -o root -g root -m 0644 infra/systemd/goho-server/goho-server.service /etc/systemd/system/goho-server.service
```

The environment install command is for first setup; preserve an existing file.
Configure `/etc/goho/server.env` and install the Google JSON key at
`/etc/goho/google-service-account.json`, owned by `root:adam` with mode `0640`.
The server listens on `127.0.0.1` without authentication.

```bash
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/goho-server.service
sudo systemctl enable --now goho-server.service
journalctl -u goho-server.service
```

Stop the receipt timer and wait for the active batch to finish before restarting
or upgrading the server. Forced shutdown can leave files in `processing`;
follow the [recovery procedure](../../../programs/goho-server/README.md#failure-outcomes-and-recovery).
Provider failure causes appear in the server journal; review before sharing.
