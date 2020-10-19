import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import type ts from 'typescript';
import type {ParsedArgs} from 'minimist';

const version = '1.0.0';
const workingDir = process.cwd();
const defaultTsconfigPath = path.join(workingDir, 'tsconfig.json');
const defaultCompilerPath = path.join(workingDir, 'node_modules/typescript/lib/typescript.js');

function printUsage(): void {
  const usageMessage = `
tsc-suppress v${version}

Usage:
  tsc-suppress --project <path> [--compiler path] [--watch]

Options:
  -P, --project <path> \t Path to the project's tsconfig.json
                       \t Default: ${defaultTsconfigPath}
  -C, --compiler <path>\t Path to the project's typescript compiler
                       \t Default: ${defaultCompilerPath}
  -W, --watch          \t Run in watch mode

Description:
The purpose of this wrapper is to execute the Typescript compiler while suppressing all
Typescript error messages. This is useful during development, when compilation is required
for debugging but type errors are expected.
`;
  console.log(usageMessage);
}

function assertDiagnostics(
  diagnostics: ts.Diagnostic[] | ts.Diagnostic | undefined,
  formatDiagnosticsHost: ts.FormatDiagnosticsHost
): number {
  if (!diagnostics) {
    return 0;
  }
  if (!Array.isArray(diagnostics)) {
    diagnostics = [diagnostics];
  }
  if (!diagnostics.length) {
    return 0;
  }

  // console.log(compiler.formatDiagnosticsWithColorAndContext(diagnostics, formatDiagnosticsHost));
  console.warn(`Suppressed errors: ${diagnostics.length}`);

  return 0;
}

async function main() {
  interface Argv extends ParsedArgs {
    compiler: string;
    project: string;
    watch: boolean;
    help: boolean;
  }
  const args = minimist(process.argv.slice(2), {
    string: ['compiler', 'project'],
    boolean: ['watch', 'help'],
    alias: {
      c: 'compiler',
      p: 'project',
      w: 'watch',
      h: 'help',
    },
    default: {
      compiler: defaultCompilerPath,
      project: defaultTsconfigPath,
      watch: false,
      help: false,
    },
  }) as Argv;

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.project) {
    console.warn('No project tsconfig.json was specified. Use the option `--project` or `-p` to ');
    process.exit(1);
  }

  if (args._.length > 2) {
    console.warn();
  }

  // if (!args.project) {
  //   const defaultTsConfig = path.join();
  // }

  const compilerPath = path.resolve(args.compiler);
  const compiler: typeof ts = await import(compilerPath);

  console.log(`Using TypeScript compiler version ${compiler.version} from ${compilerPath}`);

  const formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: (filename: string) => filename,
    getCurrentDirectory: compiler.sys.getCurrentDirectory,
    getNewLine: () => compiler.sys.newLine,
  };

  if (args.watch) {
    // Watch the project directory
    let watchDiagnostics: ts.Diagnostic[] = [];
    // const what = compiler.createWatchCompilerHost()

    // const configParseResult = compiler.parseJsonConfigFileContent(
    //   configObject.config,
    //   compiler.sys,
    //   process.cwd(),
    //   undefined,
    //   args.project
    // );

    const watchCompilerHost = compiler.createWatchCompilerHost(
      args.project,
      {},
      compiler.sys,
      compiler.createSemanticDiagnosticsBuilderProgram,
      (diagnostic: ts.Diagnostic) => {
        // Report diagnostic
        watchDiagnostics.push(diagnostic);
      },
      (diagnostic: ts.Diagnostic) => {
        // Report watch status
        if (diagnostic.code === 6031 || diagnostic.code === 6032) {
          // Starting compilation | File change detected
          process.stdout.write('\u001b[2J\u001b[0;0H'); // clear console
          watchDiagnostics = [];
          assertDiagnostics(diagnostic, formatHost);
        } else if (diagnostic.code === 6194) {
          // Compilation done
          assertDiagnostics(diagnostic, formatHost);
          assertDiagnostics(watchDiagnostics, formatHost);
          console.log('Watching for file changes.');
        }
      }
    );

    const createProgram = watchCompilerHost.createProgram;
    watchCompilerHost.createProgram = (rootNames, options, wcHost, oldProgram) => {
      return createProgram(rootNames, options, wcHost, oldProgram);
    };
    const afterProgramCreate = watchCompilerHost.afterProgramCreate;
    watchCompilerHost.afterProgramCreate = (program) => {
      afterProgramCreate?.(program);
    };
    compiler.createWatchProgram(watchCompilerHost);
  } else {
    // Do not watch the project directory
    const configObject = compiler.parseConfigFileTextToJson(
      args.project,
      fs.readFileSync(args.project).toString()
    );

    assertDiagnostics(configObject.error, formatHost);

    const configParseResult = compiler.parseJsonConfigFileContent(
      configObject.config,
      compiler.sys,
      path.dirname(args.project), // always resolve to directory of tsconfig provided
      undefined,
      args.project
    );

    assertDiagnostics(configParseResult.errors, formatHost);

    const compilerHost = compiler.createCompilerHost(configParseResult.options);
    const program = compiler.createProgram({
      rootNames: configParseResult.fileNames,
      options: configParseResult.options,
      projectReferences: configParseResult.projectReferences,
      host: compilerHost,
      configFileParsingDiagnostics: compiler.getConfigFileParsingDiagnostics(configParseResult),
    });
    const emitResult = program.emit();
    const allDiagnostics = compiler.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
    const exitCode = assertDiagnostics(allDiagnostics, compilerHost);
    process.exit(exitCode);
  }
}

// main().catch(console.error);
