# Docker deployment over Tailscale

GitHub Actions builds the server image on every merge to `dev` and deploys it to
the Goho server. The server and Postgres run under Docker Compose, and the API is
reachable only on your tailnet through Tailscale Serve.

1. The `image` job builds `programs/goho-server/Dockerfile` and pushes
   `ghcr.io/adamaho/goho-server:<commit>`.
2. The `deploy` job joins the tailnet as a temporary `tag:goho-ci` node, using
   GitHub's OIDC token rather than a stored Tailscale key.
3. It connects to the server as `goho` with Tailscale SSH, copies
   [`compose.yml`](./compose.yml) to `/opt/goho`, and runs [`deploy.sh`](./deploy.sh).
4. `deploy.sh` pulls the image, starts the stack, and fails the run if the
   server does not become healthy. Migrations run when the server container starts.

## What stays out of the public repository

This repository is public, so the setup keeps every private value on the server
or in GitHub's encrypted secrets:

- Application secrets, such as the OpenAI key and the Postgres password, live only in
  `/etc/goho/*.env` on the server. The image is built from an allowlist
  ([`.dockerignore`](../../../.dockerignore)) that excludes every `.env` file.
- The server's tailnet name lives in the `production` environment's secrets, and
  GitHub masks it in logs. The workflow never prints it.
- No Tailscale key or SSH key exists anywhere. CI proves its identity with a
  short-lived GitHub OIDC token that Tailscale only accepts from the
  `production` environment of this repository.
- The registry login on the server uses the job's own `GITHUB_TOKEN`, which
  expires when the run ends. The workflow logs out afterwards.
- The workflow never runs for pull requests, so code from a fork cannot reach
  the secrets or the tailnet.
- The API port listens only on `127.0.0.1`. Tailscale Serve is the only way in.

The image contains only open-source code from this repository, nothing private.

## One-time setup

### 1. Tailscale access policy

In the [Tailscale admin console](https://login.tailscale.com/admin/acls), add
the tags, access grants and SSH rule to the policy file. Replace the emails with
your Tailscale logins:

```jsonc
{
  "tagOwners": {
    "tag:goho-server": ["autogroup:admin"],
    "tag:goho-ci": ["autogroup:admin"],
  },
  "grants": [
    // The phones and laptops of the two people who use Goho.
    {
      "src": ["you@example.com", "bryanne@example.com"],
      "dst": ["tag:goho-server"],
      "ip": ["443"],
    },
    // CI may only open SSH to the Goho server.
    { "src": ["tag:goho-ci"], "dst": ["tag:goho-server"], "ip": ["22"] },
  ],
  "ssh": [
    // "accept", not "check": CI cannot complete a browser re-authentication.
    { "action": "accept", "src": ["tag:goho-ci"], "dst": ["tag:goho-server"], "users": ["goho"] },
  ],
}
```

If the policy still has the default allow-all rule, these grants add nothing until
you remove it. Invite Bryanne to the tailnet from **Users**; the free plan covers
up to six users.

Under **DNS**, enable MagicDNS and HTTPS certificates.

### 2. Server

On the Goho server, install Tailscale and join it with the server tag and
Tailscale SSH:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh --advertise-tags=tag:goho-server
```

Create the deploy user and give it the deployment directory and configuration.
Membership of the `docker` group is equivalent to root on this machine, so the
SSH rule above limits who can log in as `goho`.

```bash
sudo useradd --system --create-home --shell /bin/bash --groups docker goho
sudo install -d -o goho -g goho -m 0750 /opt/goho
sudo install -d -o goho -g goho -m 0700 /var/lib/goho/receipt-uploads
```

`/etc/goho/server.env` and `/etc/goho/postgres.env` already exist from the
systemd installer. Let the deploy user read them:

```bash
sudo chgrp goho /etc/goho /etc/goho/server.env /etc/goho/postgres.env
sudo chmod 0750 /etc/goho
sudo chmod 0640 /etc/goho/server.env /etc/goho/postgres.env
```

On a fresh machine, create both files first.
[`.env.example`](../goho-server/.env.example) lists the server settings, and
`postgres.env` holds `POSTGRES_PASSWORD=` followed by a URL-safe value such as
`openssl rand -hex 32`. Compose sets `DATABASE_URL`, the port, the bind address and
the uploads directory itself, so those lines in `server.env` are ignored.

Publish the API to the tailnet over HTTPS:

```bash
sudo tailscale serve --bg 13000
tailscale serve status
```

The status shows the server's address, such as `https://goho.<tailnet>.ts.net`.

### 3. Tailscale credential for CI

On the [Trust credentials](https://login.tailscale.com/admin/settings/trust-credentials)
page, create an **OpenID Connect** credential:

- Issuer: **GitHub Actions**
- Subject: `repo:adamaho/goho:environment:production`
- Scope: `auth_keys` (write), with tag `tag:goho-ci`

Copy the **Client ID** and **Audience** it shows.

### 4. GitHub environment

In the repository's **Settings → Environments**, create `production`:

- **Deployment branches and tags**: selected branches, `dev` only.
- **Environment secrets**:
  - `TS_OAUTH_CLIENT_ID`: the credential's Client ID
  - `TS_AUDIENCE`: the credential's Audience
  - `GOHO_DEPLOY_HOST`: the server's MagicDNS name, such as `goho` or `goho.<tailnet>.ts.net`

## Switching over from the systemd install

Do this once, after the setup above. Receipts and photos stay where they are: the
Compose project reuses the existing `goho-deployment` Postgres volume and the
uploads directory.

1. Back up the database:

   ```bash
   sudo docker compose --env-file /etc/goho/postgres.env -f /etc/goho/compose.yml \
     exec -T postgres pg_dump -U goho -d goho > goho-$(date +%F).sql
   ```

2. Stop and disable the systemd services:

   ```bash
   sudo systemctl disable --now goho-server.service goho-postgres.service
   ```

3. Give the deploy user the existing photos. If `GOHO_UPLOADS_DIRECTORY` in
   `server.env` points somewhere else, move the photos to
   `/var/lib/goho/receipt-uploads` first.

   ```bash
   sudo chown -R goho:goho /var/lib/goho/receipt-uploads
   ```

4. In GitHub, open **Actions → deploy → Run workflow** on `dev`, then check
   `https://<server address>/health` from a device on the tailnet.

5. Once it works, remove the old units and the checkout:

   ```bash
   sudo rm /etc/systemd/system/goho-server.service /etc/systemd/system/goho-postgres.service
   sudo rm -r /etc/systemd/system/goho-server.service.d /etc/goho/compose.yml
   sudo systemctl daemon-reload
   ```

## Day to day

- **Deploy:** merge to `dev`. The workflow deploys only when Turbo reports
  `@goho/infra-deployment` as affected: a change to the server, a workspace
  package it uses, or `infra/deployment`. Run the workflow by hand to redeploy.
- **Roll back:** re-run the `deploy` workflow run of an earlier commit. It
  deploys that commit's image.
- **Logs:** `sudo docker logs --follow goho-deployment-server-1`
- **Backups:** Compose does not back anything up. Keep copies of the `pg_dump`
  output and `/var/lib/goho/receipt-uploads` off the machine.

## Android app

Point the release build at the Tailscale Serve address without committing it.
Add it to `~/.gradle/gradle.properties` on the machine that builds the app:

```properties
gohoServerUrl=https://goho.<tailnet>.ts.net
```

Both phones need the Tailscale app signed in to the tailnet.
