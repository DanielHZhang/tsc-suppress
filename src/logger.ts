import chalk from 'chalk';
import {defaultCompilerPath, defaultTsconfigPath, version} from './constants';

const info = chalk.blue('info');
const warning = chalk.yellow('warning');
const error = chalk.red('error');

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

export const log = {
  bold(message: string): void {
    console.log(chalk.bold(message));
  },
  info(message: string): void {
    console.log(`${info} ${message}`);
  },
  warn(message: string): void {
    console.warn(`${warning} ${message}`);
  },
  error(message: string): void {
    console.error(`${error} ${message}`);
  },
  printCompletion(numErrors: number): void {
    if (numErrors > 0) {
      console.warn(`${warning} Suppressed Typescript errors: ${numErrors}`);
    } else {
      console.log(`${info} No Typescript errors found.`);
    }
    console.log(`${info} Compilation completed successfully.`);
  },
  printUsage(): void {
    console.log(usageMessage);
  },
};
