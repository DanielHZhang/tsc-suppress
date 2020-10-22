import fs from 'fs';
import path from 'path';
import type ts from 'typescript';

export interface TransformOptions {
  baseUrl: string;
  project?: string;
  rewrite?: (importPath: string, sourceFilePath: string) => string;
  alias?: Record<string, string>;
}

function rewritePath(
  importPath: string,
  sourceFile: ts.SourceFile,
  options: TransformOptions,
  regexps: Record<string, RegExp>
) {
  if (options.alias) {
    for (const alias of Object.keys(regexps)) {
      const regex = regexps[alias];
      if (regexps[alias].test(importPath)) {
        return importPath.replace(regex, options.alias[alias]);
      }
    }
  }

  if (typeof options.rewrite === 'function') {
    const newImportPath = options.rewrite(importPath, sourceFile.fileName);
    if (newImportPath) {
      return newImportPath;
    }
  }

  if (options.project && options.baseUrl && importPath.startsWith('.')) {
    const sourceDirectory = path.dirname(sourceFile.fileName);
    const foundPath = path.resolve(sourceDirectory, importPath).split(options.baseUrl)[1];
    return `${options.project}${foundPath}`;
  }
  return importPath;
}

export class CompilerContext {
  public compiler: typeof ts;
  public formatDiagnosticsHost: ts.FormatDiagnosticsHost;

  public constructor(compiler: typeof ts) {
    this.compiler = compiler;
    this.formatDiagnosticsHost = {
      getCanonicalFileName: (filename: string) => filename,
      getCurrentDirectory: compiler.sys.getCurrentDirectory,
      getNewLine: () => compiler.sys.newLine,
    };
  }

  public assertDiagnostics(diagnostics?: ts.Diagnostic[] | ts.Diagnostic): void {
    if (!diagnostics) {
      return;
    }
    if (!Array.isArray(diagnostics)) {
      diagnostics = [diagnostics];
    }
    if (!diagnostics.length) {
      return;
    }
    const diagnosticsMessage = this.compiler.formatDiagnosticsWithColorAndContext(
      diagnostics,
      this.formatDiagnosticsHost
    );
    console.log(diagnosticsMessage);
  }

  /** Parse tsconfig.json options */
  public parseTsconfigJson(project: string): ts.ParsedCommandLine {
    const rawConfigJson = fs.readFileSync(project).toString();
    const configObject = this.compiler.parseConfigFileTextToJson(project, rawConfigJson);
    const configParseResult = this.compiler.parseJsonConfigFileContent(
      configObject.config,
      this.compiler.sys,
      path.dirname(project), // always resolve directory of provided tsconfig.json
      undefined,
      project
    );
    return configParseResult;
  }

  public transformerFactory(options: TransformOptions): ts.TransformerFactory<ts.SourceFile> {
    // const {alias = {}} = options;
    // const regexps: Record<string, RegExp> = Object.keys(alias).reduce((all, regexString) => {
    //   all[regexString] = new RegExp(regexString, 'gi');
    //   return all;
    // }, {} as Record<string, RegExp>);
    const regexes: Record<string, RegExp> = {};
    for (const key in options.alias) {
      regexes[key] = new RegExp(options.alias[key], 'gi');
    }

    return (context): ts.Transformer<ts.SourceFile> => {
      return (sourceFile) => {
        return this.compiler.visitNode(
          sourceFile,
          this.visitor(context, sourceFile, options, regexes)
        );
      };
    };
  }

  private isDynamicImport(node: ts.Node): node is ts.CallExpression {
    return (
      this.compiler.isCallExpression(node) &&
      node.expression.kind === this.compiler.SyntaxKind.ImportKeyword
    );
  }

  // private isSourceFile(value: ts.SourceFile | ts.Bundle): value is ts.SourceFile {
  //   return value.kind === this.compiler.SyntaxKind.SourceFile;
  // }

  private visitor(
    context: ts.TransformationContext,
    sourceFile: ts.SourceFile,
    options: TransformOptions = {baseUrl: ''},
    regexps: Record<string, RegExp>
  ): ts.Visitor {
    const visitor: ts.Visitor = (node: ts.Node): ts.Node => {
      let importPath = '';

      // if (this.isSourceFile(sourceFile)) {
      //   // Currently visiting a source file
      // } else {
      //   // Currently visiting a bundle file (generated d.ts file)
      //   console.log('visiting non-source file', sourceFile);
      //   throw new Error('Bundle files not supported.');
      // }

      if (
        (this.compiler.isImportDeclaration(node) || this.compiler.isExportDeclaration(node)) &&
        node.moduleSpecifier
      ) {
        // Default/named import declaration
        const importPathWithQuotes = node.moduleSpecifier.getText(sourceFile);
        importPath = importPathWithQuotes.substr(1, importPathWithQuotes.length - 2);
      } else if (this.isDynamicImport(node)) {
        // Dynamic import has single argument import path
        const importPathWithQuotes = node.arguments[0].getText(sourceFile);
        importPath = importPathWithQuotes.substr(1, importPathWithQuotes.length - 2);
      } else if (
        this.compiler.isImportTypeNode(node) &&
        this.compiler.isLiteralTypeNode(node.argument) &&
        this.compiler.isStringLiteral(node.argument.literal)
      ) {
        // use `.text` instead of `getText`
        importPath = node.argument.literal.text;
      }

      if (importPath) {
        const rewrittenPath = rewritePath(importPath, sourceFile, options, regexps);
        // TODO: Deprecated, use ts.factory.cloneNode() when
        // https://github.com/microsoft/TypeScript/issues/40507 is fixed.
        const newNode = this.compiler.getMutableClone(node);

        // Only rewrite relative path
        if (rewrittenPath !== importPath) {
          if (
            this.compiler.isImportDeclaration(newNode) ||
            this.compiler.isExportDeclaration(newNode)
          ) {
            // @ts-ignore 2540
            newNode.moduleSpecifier = ts.createLiteral(rewrittenPath);
          } else if (this.isDynamicImport(newNode)) {
            // @ts-ignore 2540
            newNode.arguments = ts.createNodeArray([ts.createStringLiteral(rewrittenPath)]);
          } else if (this.compiler.isImportTypeNode(newNode)) {
            // @ts-ignore 2540
            newNode.argument = ts.createLiteralTypeNode(ts.createStringLiteral(rewrittenPath));
          }
          return newNode;
        }
      }
      return this.compiler.visitEachChild(node, visitor, context);
    };
    return visitor;
  }
}
