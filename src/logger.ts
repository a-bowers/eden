import Color from 'chalk';
import * as Debug from 'debug';

/**
 * Debug powered Magic logger.
 */
if (!module.parent) {
  throw new Error('You are not supposed to run this from as script');
}

const filename = module.parent.filename.replace(process.cwd(), '');
const fileInfoStr =
  Color.gray.dim('(') + Color.gray.underline(filename) + Color.gray.dim(')');

export default function createLogger(namespace: string): ILogR {
  const logger: ILogR = {} as any;
  ['info', 'error', 'warn', 'debug'].reduce((l, method) => {
    const log = Debug(`${namespace}:${method}`);
    l[method] = ((fmt: string, ...args: any[]) =>
      log(`${fileInfoStr} ${fmt}`, ...args)) as Debug.IDebugger;
    return l;
  }, logger);

  return logger;
}

// Workaround.
export interface ILogR {
  [key: string]: Debug.IDebugger;
  info: Debug.IDebugger;
  warn: Debug.IDebugger;
  error: Debug.IDebugger;
  debug: Debug.IDebugger; // or debug
}

delete require.cache[__filename];
