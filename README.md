# Goho

Goho is organized as a pnpm and Turborepo workspace with a shared, reproducible
development environment.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow,
verification commands, workspace conventions, and commit guidelines.

## Prerequisites

Before developing in this repository, install:

- [Node.js 24](https://nodejs.org/en/download)
- [pnpm 12.3.4](https://pnpm.io/installation)
- [Docker](https://docs.docker.com/get-docker/)

You can give the following prompt to a coding agent running on your machine:

```text
Configure this machine to work on the Goho project. Read README.md,
CONTRIBUTING.md, and package.json first. Check whether the required Node.js,
pnpm, and Docker versions are installed and working; install or enable them when
possible, but ask before running commands that need administrator access.
Install dependencies with pnpm and run the documented verification command.
Report any manual steps or failures clearly, and don't change project files
unless machine-specific setup requires it.
```

## Development

Install dependencies with the versions declared in `package.json`:

```bash
pnpm install
```

Amp orbs run `.agents/setup`, which installs the pinned pnpm and Node.js versions
and configures GitHub Packages authentication from `NODE_AUTH_TOKEN`.

## Receipt processing

Start the [Goho server](programs/goho-server/README.md), then use the
[CLI](programs/goho-cli/README.md) to process a batch. The shared contract and client
live in [clients/goho-server](clients/goho-server/README.md).
