import fs from 'fs';
import path from 'path';
import assert from 'assert';
import chalk from 'chalk';
import minimist from 'minimist';
import type ts from 'typescript';
import type {ParsedArgs} from 'minimist';

const version = '1.0.2';
const workingDir = process.cwd();
const defaultTsconfigPath = path.join(workingDir, 'tsconfig.json');
const defaultCompilerPath = path.join(workingDir, 'node_modules/typescript/lib/typescript.js');

function printUsage(): void {
  const usageMessage = `
${chalk.bold(`tsc-suppress v${version}`)}

Usage:
  tsc-suppress [options]

Options:
  -P, --project <path> \t Path to the project's tsconfig.json
                       \t Default: ${defaultTsconfigPath}
  -C, --compiler <path>\t Path to the project's typescript compiler
                       \t Default: ${defaultCompilerPath}
  -W, --watch          \t Run in watch mode

Description:
This wrapper executes the Typescript compiler while suppressing all Typescript error messages.
This is useful during development when successful compilation is required for debugging but
type errors are expected.
`;
  console.log(usageMessage);
}

type Argv = {
  compiler: string;
  project: string;
  watch: boolean;
  help: boolean;
  _?: string[];
};

export = async function tsc(args?: Argv): Promise<void> {
  const defaultArgs: Argv = {
    compiler: defaultCompilerPath,
    project: defaultTsconfigPath,
    watch: false,
    help: false,
  };

  if (args) {
    // Validate args if used programmatically
    if (args.compiler) {
      assert(typeof args.compiler === 'string', 'Option "compiler" must be of type string');
    }
    if (args.project) {
      assert(typeof args.project === 'string', 'Option "project" must be of type string');
    }
    if (args.watch) {
      assert(typeof args.watch === 'boolean', 'Option "watch" must be of type boolean');
    }
    args = Object.assign(defaultArgs, args);
  } else {
    // Parse and validate args if used via CLI
    args = minimist(process.argv.slice(2), {
      string: ['compiler', 'project'],
      boolean: ['watch', 'help'],
      alias: {
        c: 'compiler',
        p: 'project',
        w: 'watch',
        h: 'help',
      },
      default: defaultArgs,
    }) as ParsedArgs & Argv;
  }

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const info = chalk.blue('info');
  const warning = chalk.yellow('warning');
  const error = chalk.red('error');

  // Resolve typescript import
  const compilerPath = path.resolve(args.compiler);
  const compiler: typeof ts = await import(compilerPath);

  // Ensure compiler path resolves to the typescript compiler
  if (
    !compiler ||
    typeof compiler.version !== 'string' ||
    typeof compiler.sys !== 'object' ||
    typeof compiler.createProgram !== 'function'
  ) {
    console.error(`${error} Cannot find Typescript compiler at: ${compilerPath}`);
    process.exit(1);
  }

  // Display runtime messages
  console.log(chalk.bold(`tsc-suppress v${version}`));
  console.log(`${info} Using Typescript v${compiler.version}`);
  console.log(`     Compiler: ${compilerPath}`);
  console.log(`     Project: ${args.project}\n`);

  if (args._ && args._.length > 2) {
    console.warn(`${warning} Unknown CLI options received: ${args._.join(', ')}\n`);
  }

  const printSuppression = (numErrors: number): void => {
    if (numErrors > 0) {
      console.warn(`${warning} Suppressed Typescript errors: ${numErrors}`);
    } else {
      console.log(`${info} No Typescript errors found.`);
    }
    console.log(`${info} Compilation completed successfully.`);
  };
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

  // Parse tsconfig.json
  const tsconfigJsonRaw = fs.readFileSync(args.project).toString();
  const configObject = compiler.parseConfigFileTextToJson(args.project, tsconfigJsonRaw);
  const configParseResult = compiler.parseJsonConfigFileContent(
    configObject.config,
    compiler.sys,
    path.dirname(args.project), // always resolve to directory of tsconfig provided
    undefined,
    args.project
  );

  if (configParseResult.options.noEmitOnError) {
    console.warn(
      `${warning} No files will be emitted even if errors are suppressed when "compilerOptions.noEmitOnError: true"`
    );
  }

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
          printSuppression(watchDiagnostics.length);
          console.log(`${info} Watching for file changes...`);
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
    const diagnostics = [...compiler.getPreEmitDiagnostics(program)]; // Shallow copy to remove readonly

    if (!emitResult.emitSkipped) {
      // Only append emit diagnostics if the emit was successful
      diagnostics.push(...emitResult.diagnostics);
    }

    assertDiagnostics(diagnostics);
    printSuppression(diagnostics.length);
  }
};
