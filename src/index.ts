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

  console.log(`tsc-suppress v${version}`);

  if (args._.length > 2) {
    console.warn(`Unknown CLI options received: ${args._.join(', ')}`);
  }

  const compilerPath = path.resolve(args.compiler);
  const compiler: typeof ts = await import(compilerPath);

  console.log(`Using Typescript v${compiler.version}`);
  console.log(`\tCompiler: ${compilerPath}`);
  console.log(`\tProject: ${args.project}`);

  const host: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: (filename: string) => filename,
    getCurrentDirectory: compiler.sys.getCurrentDirectory,
    getNewLine: () => compiler.sys.newLine,
  };
  const assertDiagnostics = (diagnostics?: ts.Diagnostic[] | ts.Diagnostic): void => {
    if (!diagnostics) {
      return;
    }
    if (!Array.isArray(diagnostics)) {
      diagnostics = [diagnostics];
    }
    if (!diagnostics.length) {
      return;
    }
    console.log(compiler.formatDiagnosticsWithColorAndContext(diagnostics, host));
  };

  const tsconfigJsonRaw = fs.readFileSync(args.project).toString();
  const configObject = compiler.parseConfigFileTextToJson(args.project, tsconfigJsonRaw);
  const configParseResult = compiler.parseJsonConfigFileContent(
    configObject.config,
    compiler.sys,
    path.dirname(args.project), // always resolve to directory of tsconfig provided
    undefined,
    args.project
  );

  if (args.watch) {
    // Only assert config parse errors when watching
    assertDiagnostics(configParseResult.errors);

    const watchDiagnostics: ts.Diagnostic[] = [];
    const watchCompilerHost = compiler.createWatchCompilerHost(
      args.project,
      {},
      compiler.sys,
      compiler.createSemanticDiagnosticsBuilderProgram,
      (diagnostic) => {
        // Report diagnostic
        watchDiagnostics.push(diagnostic);
      },
      (diagnostic) => {
        // Report watch status
        if (diagnostic.code === 6031 || diagnostic.code === 6032) {
          // Starting compilation || File change detected
          process.stdout.write('\u001b[2J\u001b[0;0H'); // Clear console
          watchDiagnostics.length = 0; // Empty the array

          assertDiagnostics(diagnostic);
        } else if (diagnostic.code === 6194) {
          // Compilation done
          watchDiagnostics.push(diagnostic);

          assertDiagnostics(watchDiagnostics);

          console.warn(`[tsc-suppress] Suppressed typescript errors: ${watchDiagnostics.length}`);
          console.log('[tsc-suppress] Watching for file changes...');
        }
      }
    );
    compiler.createWatchProgram(watchCompilerHost);
  } else {
    // Do not watch the project directory
    const program = compiler.createProgram({
      rootNames: configParseResult.fileNames,
      options: configParseResult.options,
      projectReferences: configParseResult.projectReferences,
      host: compiler.createCompilerHost(configParseResult.options),
      configFileParsingDiagnostics: compiler.getConfigFileParsingDiagnostics(configParseResult),
    });
    const emitResult = program.emit();
    const allDiagnostics = compiler.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

    assertDiagnostics(allDiagnostics);
    console.warn(`[tsc-suppress] Suppressed typescript errors: ${allDiagnostics.length}`);
  }
}

main().catch(console.error);
