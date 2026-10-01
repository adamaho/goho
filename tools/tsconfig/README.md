# @goho/tool-tsconfig

Shared TypeScript configurations for this Turborepo.

## Exports

- `@goho/tool-tsconfig/base`: strict baseline compiler defaults.
- `@goho/tool-tsconfig/program`: NodeNext defaults and Effect diagnostics for programs.
- `@goho/tool-tsconfig/app-vite`: bundler and React defaults for Vite workspaces.

## Usage in a workspace package

1. Add this package to the workspace's `devDependencies`:

```json
{
  "devDependencies": {
    "@goho/tool-tsconfig": "workspace:*"
  }
}
```

2. Extend the workspace `tsconfig.json`:

```json
{
  "extends": "@goho/tool-tsconfig/program",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

## Effect API stability

The program configuration permits Effect's `@stability unstable` APIs because
Goho already depends on its HTTP, SQL, AI, and persistence modules. Effect 4.0
retains these annotations even though the core package is stable.

Only `unstableApiUsage` is disabled. The remaining Effect diagnostics, including
the error severities from `@adamaho/nopeus-tsconfig/effect`, remain enabled. Those
plugin options are repeated locally because TypeScript replaces the inherited
`plugins` array; keep them aligned when updating the upstream configuration.
