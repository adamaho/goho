# @goho/tool-tsconfig

Shared TypeScript configurations for this Turborepo.

## Exports

- `@goho/tool-tsconfig/base`: strict baseline compiler defaults.
- `@goho/tool-tsconfig/service`: NodeNext service defaults for backend workspaces.

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
  "extends": "@goho/tool-tsconfig/service",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```
