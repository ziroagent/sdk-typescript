import kleur from 'kleur';
import { runInit } from './commands/init.js';
import { runPlayground } from './commands/playground.js';
import { listExamples, runExample } from './commands/run.js';
import { parseArgs } from './util/args.js';
import { createLogger } from './util/logger.js';

const VERSION = '0.1.0';

const HELP = `${kleur.bold('ziroagent')} ${kleur.gray(`v${VERSION}`)}

${kleur.bold('Usage:')}  ziroagent <command> [options]

${kleur.bold('Commands:')}
  init [dir]               Scaffold a new Ziro app (default template: basic)
  run <example>            Run a bundled example by name
  run --list               List available examples
  playground               Boot the local dev playground (Next.js)
  help                     Print this help
  version                  Print the CLI version

${kleur.bold('Examples:')}
  $ ziroagent init my-agent
  $ ziroagent run basic-chat
  $ ziroagent playground --port 4000
`;

async function main(argv: string[]): Promise<number> {
  const logger = createLogger();
  const [command, ...rest] = argv;
  const { _: positional, flags } = parseArgs(rest);

  switch (command) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(HELP);
      return 0;
    case 'version':
    case '--version':
    case '-v':
      process.stdout.write(`${VERSION}\n`);
      return 0;
    case 'init': {
      const dir = positional[0] ?? '.';
      const opts: Parameters<typeof runInit>[0] = { cwd: dir, logger };
      if (typeof flags.template === 'string') opts.template = flags.template as 'basic';
      if (typeof flags.name === 'string') opts.name = flags.name;
      if (flags.force === true) opts.force = true;
      await runInit(opts);
      return 0;
    }
    case 'run': {
      if (flags.list === true) {
        const items = listExamples();
        if (items.length === 0) logger.warn('No examples found.');
        for (const name of items) process.stdout.write(`${name}\n`);
        return 0;
      }
      const example = positional[0];
      if (!example) {
        logger.error('Missing example name. Try `ziroagent run --list`.');
        return 1;
      }
      return await runExample({ example, cwd: process.cwd(), logger });
    }
    case 'playground': {
      const opts: Parameters<typeof runPlayground>[0] = { logger };
      if (typeof flags.port === 'string') opts.port = Number.parseInt(flags.port, 10);
      else if (typeof flags.port === 'number') opts.port = flags.port;
      return await runPlayground(opts);
    }
    default:
      logger.error(`Unknown command: ${command}`);
      process.stdout.write(HELP);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${kleur.red('✖')} ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
