import path from 'path';

export const version = '1.0.2';
export const workingDir = process.cwd();
export const defaultTsconfigPath = path.join(workingDir, 'tsconfig.json');
export const defaultCompilerPath = path.join(
  workingDir,
  'node_modules/typescript/lib/typescript.js'
);
