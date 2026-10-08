# Deployment configuration

[`goho-server/.env.example`](./goho-server/.env.example) is the production
server configuration template. Its path is retained for existing consumers.

The server owns its Dockerfile, Compose stack and release scripts. Follow the
[current deployment guide](../../programs/goho-server/CONTRIBUTING.md#deployment) for host
setup and CI deployment.
