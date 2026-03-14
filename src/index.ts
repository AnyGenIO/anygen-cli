#!/usr/bin/env node

/**
 * AnyGen CLI entry point
 *
 * Two-phase startup:
 * 1. Register static commands (auth, skill)
 * 2. Fetch Discovery Document → register dynamic commands
 */

import { Command } from 'commander';
import { loadConfig } from './config/config.js';
import { getDiscoveryDocument, clearCache } from './discovery/client.js';
import type { DiscoveryDocument } from './discovery/types.js';
import { buildDynamicCommands, buildSchemaCommand } from './commands/dynamic.js';
import { buildAuthCommand } from './commands/auth-cmd.js';
import { buildSkillCommand } from './commands/skill-cmd.js';

const program = new Command('anygen')
  .version('0.1.0')
  .description('AnyGen CLI - AI content generation platform');

program
  .option('--api-key <key>', 'API Key (overrides env and config file)')
  .option('--no-cache', 'Skip Discovery Document cache');

// Static commands
buildAuthCommand(program);
buildSkillCommand(program);

program
  .command('cache-clear', { hidden: true })
  .description('Clear Discovery Document cache')
  .action(async () => {
    await clearCache();
    console.log('Cache cleared');
  });

function printHelp(doc: DiscoveryDocument | null): void {
  let resourcesBlock = '';
  if (doc) {
    const lines: string[] = [];
    for (const [name, resource] of Object.entries(doc.resources)) {
      const desc = resource.description || Object.keys(resource.methods).join(', ');
      lines.push(`    ${name.padEnd(17)}${desc}`);
    }
    resourcesBlock = `\nRESOURCES:\n${lines.join('\n')}`;
  } else {
    resourcesBlock = '\nRESOURCES:\n    (unavailable — check network or run anygen cache-clear)';
  }

  console.log(`anygen — AI content generation CLI

USAGE:
    anygen <resource> <method> [flags]
    anygen schema [resource.method]

EXAMPLES:
    anygen task +run --operation slide --prompt "Q4 deck" --output-dir .
    anygen message +chat --task-id <id> --content "Change the title"
    anygen file upload --file ./data.csv
    anygen schema task.create
${resourcesBlock}

COMMANDS:
    auth             Authenticate with AnyGen
    schema           Inspect API schema
    skill            Manage Agent Skills

FLAGS:
    --params <json>  Request body as JSON string
    --raw            Output raw JSON without formatting
    --api-key <key>  API Key (overrides env and config file)
    --no-cache       Skip Discovery Document cache
    -V, --version    Show version
    -h, --help       Show this help (try: anygen task --help)

ENVIRONMENT:
    ANYGEN_API_KEY   API key for authentication

AUTH:
    anygen auth login                  Web login or verify existing key
    anygen auth login --api-key sk-xxx Configure a specific API key
    anygen auth status                 Show current authentication status
    anygen auth logout                 Remove stored API key`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const skipDiscovery = ['auth', 'cache-clear', 'skill', '-V', '--version'].includes(args[0]);
  const isHelp = args.length === 0 || (args.length === 1 && ['-h', '--help'].includes(args[0]));

  const globalOpts = program.opts();
  const config = await loadConfig({ apiKey: globalOpts.apiKey });

  // Fetch Discovery Document (needed for both help and dynamic commands)
  let doc: DiscoveryDocument | null = null;
  if (!skipDiscovery) {
    try {
      if (globalOpts.cache === false) {
        await clearCache();
      }
      doc = await getDiscoveryDocument(config.baseUrl);
      buildDynamicCommands(program, doc, config);
      buildSchemaCommand(program, doc);
    } catch (err: unknown) {
      if (!isHelp) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Warning: Cannot fetch Discovery Document: ${message}`);
        console.error('Only static commands available. Check network or API status.\n');
      }
    }
  }

  if (isHelp) {
    printHelp(doc);
    process.exit(0);
  }

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
