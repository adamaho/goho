# @goho/goho-mcp

A local MCP server for Goho. It currently offers one tool, `hello`, which returns a greeting. It does not connect to the Goho API yet.

Install dependencies from the repository root with `pnpm install`. Configure your MCP client to launch the server over stdio with:

```bash
pnpm --dir /absolute/path/to/goho/programs/goho-mcp start
```

Replace `/absolute/path/to/goho` with your checkout path. The server stays running while the client is connected; it does not print a greeting directly to the terminal. The `hello` tool is available through the MCP client.
