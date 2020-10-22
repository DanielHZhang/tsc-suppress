import path from 'path';
import assert from 'assert';
import minimist from 'minimist';
import type ts from 'typescript';
import type {ParsedArgs} from 'minimist';
import {CompilerContext} from './context';
import {log} from './logger';
import {defaultCompilerPath, defaultTsconfigPath, version} from './constants';

type CompilerOptions = {
  /** Path to the project's typescript compiler */
  compiler?: string;
  /** Path to the project's tsconfig.json */
  project?: string;
  /** Run in watch mode */
  watch?: boolean;
  /** Skip execution and print CLI usage */
  help?: boolean;
};

type ParsedArguments = Required<CompilerOptions> & ParsedArgs;

export = async function tsc(options?: CompilerOptions): Promise<void> {
  let args: ParsedArguments = {
    compiler: defaultCompilerPath,
    project: defaultTsconfigPath,
    watch: false,
    help: false,
    _: [],
  };

  if (options) {
    // Validate args if used programmatically
    if (options.compiler) {
      assert(typeof options.compiler === 'string', 'Option "compiler" must be of type string.');
    }
    if (options.project) {
      assert(typeof options.project === 'string', 'Option "project" must be of type string.');
    }
    if (options.watch) {
      assert(typeof options.watch === 'boolean', 'Option "watch" must be of type boolean.');
    }
    args = Object.assign(args, options);
  } else {
    // Parse and validate args if used via CLI
    const parsed = minimist(process.argv.slice(2), {
      string: ['compiler', 'project'],
      boolean: ['watch', 'help'],
      alias: {
        c: 'compiler',
        p: 'project',
        w: 'watch',
        h: 'help',
      },
      default: args,
    });
    args = Object.assign(args, parsed);
  }

  if (args.help) {
    log.printUsage();
    process.exit(0);
  }

  // Resolve Typescript compiler import.
  const compilerPath = path.resolve(args.compiler);
  const compiler: typeof ts = await import(compilerPath);

  // Ensure the compiler path resolves to the Typescript compiler.
  if (
    !compiler ||
    typeof compiler.version !== 'string' ||
    typeof compiler.sys !== 'object' ||
    typeof compiler.createProgram !== 'function'
  ) {
    log.error(`Cannot find Typescript compiler at: ${compilerPath}`);
    process.exit(1);
  }

  const context = new CompilerContext(compiler);

  // Display runtime messages.
  log.bold(`tsc-suppress v${version}`);
  log.info(`Using Typescript v${compiler.version}`);
  console.log(`     Compiler: ${compilerPath}`);
  console.log(`     Project: ${args.project}\n`);

  if (args._ && args._.length > 2) {
    log.warn(`Unknown options received: ${args._.join(', ')}\n`);
  }

  const configParseResult = context.parseTsconfigJson(args.project);
  if (configParseResult.options.noEmitOnError) {
    const message =
      'No files will be emitted even if errors are suppressed ' +
      'when "compilerOptions.noEmitOnError: true"';
    log.warn(message);
  }

  if (args.watch) {
    // Only assert config parse errors when watching
    context.assertDiagnostics(configParseResult.errors);

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
          context.assertDiagnostics(diagnostic);
        } else if (diagnostic.code === 6194) {
          // Compilation done
          watchDiagnostics.push(diagnostic);
          context.assertDiagnostics(watchDiagnostics);
          log.printCompletion(watchDiagnostics.length);
          log.info(' Watching for file changes...');
        }
      }
    );
    compiler.createWatchProgram(watchCompilerHost);
  } else {
    // Do not watch the project directory
    // const fileNames = globSync(input); // input = some string passed into function
    const fileNames = configParseResult.fileNames;

    const program = compiler.createProgram({
      host: compiler.createCompilerHost(configParseResult.options),
      options: configParseResult.options,
      rootNames: fileNames,
      projectReferences: configParseResult.projectReferences,
      configFileParsingDiagnostics: compiler.getConfigFileParsingDiagnostics(configParseResult),
    });

    const factory = context.transformerFactory({
      baseUrl: configParseResult.options.baseUrl || '',
      project: 'what',
    });
    const emitResult = program.emit(undefined, undefined, undefined, undefined, {
      after: [factory],
      afterDeclarations: [factory as ts.TransformerFactory<ts.SourceFile | ts.Bundle>],
    });
    const diagnostics = [...compiler.getPreEmitDiagnostics(program)]; // Shallow copy to remove readonly

    if (!emitResult.emitSkipped) {
      // Only append emit diagnostics if the emit was successful
      diagnostics.push(...emitResult.diagnostics);
    }

    context.assertDiagnostics(diagnostics);
    log.printCompletion(diagnostics.length);
  }
};
