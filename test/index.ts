import path from 'path';
import tsc from '../src/index';

tsc({project: path.join(process.cwd(), 'tsconfig.json')}).catch(console.error);
