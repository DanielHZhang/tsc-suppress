# tsc-suppress

This wrapper executes the Typescript compiler while suppressing all Typescript error messages. This is useful during development when successful compilation is required for debugging but type errors are expected. 

The default behaviour of `tsc-suppress` is similar to using the `--transpile-only` flag option in [ts-node][ts-node-url].

### Installation

Via npm:

```
npm i tsc-suppress -D
```

Via yarn:

```
yarn add tsc-suppress -D
```

## Usage API

```
tsc-suppress [--project <path>] [--compiler <path>] [--watch]
```

## Options

- `-P, --project <path>`
  - Path to the project's tsconfig.json
  - Default: `${cwd}/tsconfig.json`
- `-C, --compiler <path>`
  - Path to the project's typescript compiler
  - Default: `${cwd}/node_modules/typescript/lib/typescript.js`
- `-W, --watch`
  - Run in watch mode
  - Default: `false`

## License

[MIT License][mit-url]

[ts-node-url]: https://github.com/TypeStrong/ts-node
[mit-url]: https://github.com/DanielHZhang/tsc-suppress/blob/main/license.md
