import kleur from 'kleur';

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  success(msg: string): void;
  step(msg: string): void;
}

export function createLogger(out: NodeJS.WriteStream = process.stderr): Logger {
  const write = (s: string) => {
    out.write(`${s}\n`);
  };
  return {
    info: (m) => write(`${kleur.cyan('›')} ${m}`),
    warn: (m) => write(`${kleur.yellow('⚠')} ${m}`),
    error: (m) => write(`${kleur.red('✖')} ${m}`),
    success: (m) => write(`${kleur.green('✔')} ${m}`),
    step: (m) => write(`${kleur.gray('•')} ${m}`),
  };
}
