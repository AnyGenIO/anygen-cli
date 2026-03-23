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
import { buildDynamicCommands } from './commands/dynamic.js';
import { buildSchemaCommand } from './commands/schema-cmd.js';
import { buildAuthCommand } from './commands/auth-cmd.js';
import { buildSkillCommand } from './commands/skill-cmd.js';
import { CLI_VERSION } from './version.js';
import { outputError, toCliError } from './errors.js';

const program = new Command('anygen')
  .version(CLI_VERSION)
  .description('AnyGen CLI - AI content generation platform')
  .helpCommand(false)
  .configureHelp({
    // Override: put description before usage (like cobra / larksuite-cli)
    formatHelp(cmd, helper) {
      const termWidth = helper.padWidth(cmd, helper);
      const helpWidth = helper.helpWidth ?? 80;
      function callFormatItem(term: string, description: string) {
        return helper.formatItem(term, termWidth, description, helper);
      }

      let output: string[] = [];

      // Description first
      const desc = helper.commandDescription(cmd);
      if (desc.length > 0) {
        output.push(helper.boxWrap(desc, helpWidth), '');
      }

      // Then usage
      output.push(`Usage: ${helper.commandUsage(cmd)}`, '');

      // Arguments
      const argList = helper.visibleArguments(cmd).map((a) =>
        callFormatItem(helper.argumentTerm(a), helper.argumentDescription(a)));
      if (argList.length > 0) output.push('Arguments:', ...argList, '');

      // Options
      const optList = helper.visibleOptions(cmd).map((o) =>
        callFormatItem(helper.optionTerm(o), helper.optionDescription(o)));
      if (optList.length > 0) output.push('Options:', ...optList, '');

      // Commands
      const cmdList = helper.visibleCommands(cmd).map((c) =>
        callFormatItem(helper.subcommandTerm(c), helper.subcommandDescription(c)));
      if (cmdList.length > 0) output.push('Commands:', ...cmdList, '');

      return output.join('\n');
    },
  });

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
      const desc = resource.description || Object.keys(resource.methods ?? {}).join(', ');
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
    anygen task create --data '{"operation":"slide","prompt":"Q4 deck"}'
    anygen task get --params '{"task_id":"xxx"}' --wait
    anygen task +download --task-id <id> --output-dir ./output
    anygen schema task.create
${resourcesBlock}

COMMANDS:
    auth             Authenticate with AnyGen
    schema           Inspect API schema (e.g. anygen schema task.create)
    skill            Manage AnyGen skills

OPTIONS:
    --params <json>       URL/path parameters as JSON
    --data <json>         Request body as JSON (POST/PUT)
    --dry-run             Show the request without sending it

ENVIRONMENT:
    ANYGEN_API_KEY   API key for authentication`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const skipDiscovery = ['auth', 'cache-clear', 'skill', '-V', '--version'].includes(args[0]);
  const isHelp = args.length === 0 || (args.length === 1 && ['-h', '--help'].includes(args[0]));

  // Pre-parse global options before parseAsync (needed for discovery phase)
  program.parseOptions(process.argv.slice(2));
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
  outputError(toCliError(err));
});
