# Goho server

This unit targets the existing `adam` user and checkout at
`/home/adam/github.com/adamaho/goho`.

## Runtime setup

Install Node.js and pnpm at the versions required by the root `package.json`,
then run `pnpm install --frozen-lockfile` in the checkout as `adam`.
Both service units use this explicit `PATH`:

```text
/home/adam/.local/share/pnpm:/home/adam/.local/bin:/usr/local/bin:/usr/bin:/bin
```

Ensure both executables are available to `adam` on that path. The services do
not load interactive shell profiles. If your tools live elsewhere, set
`Environment="PATH=..."` with the complete path in a systemd override for each
service. Check the versions with that same path before starting the services.

## Install the service

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
