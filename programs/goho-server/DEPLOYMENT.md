# Goho server deployment

The server owns its Dockerfile, Compose stack and build/deploy scripts. GitHub
Actions identifies affected programs with Turbo on pushes to `dev` and deploys
them in parallel matrix jobs. A manual run deploys all programs. The workflow
currently provides Docker, GHCR and Tailscale access to one host.

- `pnpm --filter @goho/goho-server build` builds and loads the commit-tagged image
  into the local Docker daemon. It needs Docker Buildx, but no deployment credentials.
- `pnpm turbo run deploy --filter=@goho/goho-server` builds first, publishes that
  image to GHCR, copies [`compose.yml`](./compose.yml) to `/opt/goho/goho-server/`,
  and runs [`scripts/remote-deploy.sh`](./scripts/remote-deploy.sh) on the host.
  The remote script pulls the image and waits for the Compose services to be healthy.

Use Turbo for deployment: calling the package's `deploy` script directly assumes
its image is already built. Build and deploy caching is disabled in the root
`turbo.json`, since Docker images and remote changes are outside Turbo's file cache.
Buildx can reuse its local layer cache; this setup does not export a registry build cache.
The PR build job builds the image without publishing or deploying it.

The image defaults to `ghcr.io/adamaho/goho-server:<git-commit>`. CI supplies
`GOHO_IMAGE_REGISTRY` and `GITHUB_SHA`; deployment also requires `GOHO_DEPLOY_HOST`
and registry authentication on both runner and host. The workflow handles those logins
and passes `GOHO_DEPLOY_DOCKER_CONFIG` to select the job's temporary host credentials.
Manual deployments use the host user's default Docker configuration when it is unset.

The Compose stack includes this application's Postgres database. Its existing
project and volume names are preserved so deployment reuses installed data.
Host setup is described below.

## What stays out of the public repository

This repository is public, so the setup keeps every private value on the server
or in GitHub's encrypted secrets:

- Application secrets, such as the OpenAI key and the Postgres password, live only in
  `/etc/goho/*.env` on the server. [`.dockerignore`](../../.dockerignore) keeps
  every `.env` file out of image builds.
- The server's tailnet name lives in the `production` environment's secrets, and
  GitHub masks it in logs. The workflow never prints it.
- No Tailscale key or SSH key exists anywhere. CI proves its identity with a
  short-lived GitHub OIDC token that Tailscale only accepts from the
  `production` environment of this repository.
- The registry login on the server uses the job's own `GITHUB_TOKEN`, which
  expires when the job ends. Each matrix job uses a separate temporary Docker
  configuration on the host and removes it afterwards, so concurrent jobs cannot
  overwrite or remove one another's registry credentials.
- The workflow never runs for pull requests, so code from a fork cannot reach
  the secrets or the tailnet.
- The API port listens only on `127.0.0.1`. Tailscale Serve is the only way in.

Images contain only open-source code from this repository, nothing private.

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

Install Docker Engine with the Compose plugin on the host first. Check that
`docker compose version` succeeds and the Docker daemon is running. Then
install Tailscale and join it with the server tag and
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
sudo install -d -o goho -g goho -m 0750 /opt/goho /opt/goho/goho-server
sudo install -d -o goho -g goho -m 0700 /var/lib/goho/receipt-uploads
```

Create `/etc/goho/server.env` from the production
[`.env.example`](../../infra/deployment/goho-server/.env.example), and create
`/etc/goho/postgres.env` containing `POSTGRES_PASSWORD=` followed by a URL-safe
password (for example, generate one with `openssl rand -hex 32`). Keep an existing
database's password when updating its configuration. Set the OpenAI credentials
in `server.env`. Compose sets `DATABASE_URL`, the port, the bind address and the
uploads directory itself.

Create the configuration directory before placing the files there:

```bash
sudo install -d -o root -g goho -m 0750 /etc/goho
```

Once both files exist, restrict access and link the database configuration for Compose:

```bash
sudo chown root:goho /etc/goho/server.env /etc/goho/postgres.env
sudo chmod 0640 /etc/goho/server.env /etc/goho/postgres.env
sudo ln -s /etc/goho/postgres.env /opt/goho/goho-server/.env
```

The link lets Compose read the Postgres password without copying it.

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

## First deployment

After completing host and GitHub setup, open **Actions → deploy → Run workflow**
on `dev`. Check `https://<server address>/health` from a device on the tailnet.

## Day to day

- **Deploy:** merge to `dev`. Edits to the workflow file alone change no
  program, so run the workflow by hand to redeploy after them.
- **Roll back:** re-run the `deploy` workflow run of an earlier commit. It
  rebuilds and deploys that commit.
- **Logs:** `sudo docker logs --follow goho-deployment-server-1`
- **Backups:** Compose does not back anything up. Keep copies of the `pg_dump`
  output and `/var/lib/goho/receipt-uploads` off the machine. For example:

  ```bash
  sudo docker exec goho-deployment-postgres-1 pg_dump -U goho -d goho > goho.sql
  ```

## Android app

Point the release build at the Tailscale Serve address without committing it.
Add it to `~/.gradle/gradle.properties` on the machine that builds the app:

```properties
gohoServerUrl=https://goho.<tailnet>.ts.net
```

Both phones need the Tailscale app signed in to the tailnet.
