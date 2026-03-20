/**
 * Dynamic command registration from Discovery Document
 *
 * resources → commander subcommands (supports nesting)
 * methods   → subcommands under each resource
 *
 * Example:
 *   anygen task create --params '{"operation":"slide",...}'
 *   anygen task get --task-id xxx
 *   anygen task message send --task-id xxx --params '{"content":"hello"}'
 */

import { Command } from 'commander';
import type { DiscoveryDocument, Resource, Method } from '../discovery/types.js';
import type { AnygenConfig } from '../config/config.js';
import { registerTaskHelpers } from './task-download.js';
import { executeMethod } from './execute.js';
import { methodSupportsPolling } from './poll.js';

export function buildDynamicCommands(
  program: Command,
  doc: DiscoveryDocument,
  config: AnygenConfig,
): void {
  for (const [resourceName, resource] of Object.entries(doc.resources)) {
    const desc = resource.description || `${resourceName} operations`;
    const resourceCmd = program
      .command(resourceName)
      .description(desc)
      .helpCommand(false);

    // Register + helper commands first so they appear at the top of --help
    if (resourceName === 'task') {
      registerTaskHelpers(resourceCmd, doc, config);
    }

    buildResourceCommands(resourceCmd, resource, doc, config);
  }
}

function buildResourceCommands(
  parentCmd: Command,
  resource: Resource,
  doc: DiscoveryDocument,
  config: AnygenConfig,
): void {
  // Build methods for this resource
  if (resource.methods) {
    for (const [methodName, method] of Object.entries(resource.methods)) {
      const methodCmd = parentCmd
        .command(methodName)
        .summary(method.description)
        .description(`${method.description}\n\nView parameter definitions before calling:\n  anygen schema ${method.id}`);

      if (method.parameters && Object.keys(method.parameters).length > 0) {
        methodCmd.option('--params <json>', 'URL/path parameters as JSON');
      }
      if (method.request) {
        methodCmd.option('--data <json>', 'Request body as JSON');
      }
      methodCmd.option('--dry-run', 'Show the request without sending it');

      if (methodSupportsPolling(method)) {
        methodCmd.option('--wait', 'Re-poll until terminal state (completed/failed)');
        methodCmd.option('--timeout <ms>', 'Polling timeout in milliseconds');
      }
      methodCmd.action(async (opts: Record<string, string>) => {
        await executeMethod(method, opts, config, doc, methodCmd);
      });
    }
  }

  // Build nested sub-resources
  if (resource.resources) {
    for (const [subName, subResource] of Object.entries(resource.resources)) {
      const subDesc = subResource.description || `${subName} operations`;
      const subCmd = parentCmd
        .command(subName)
        .description(subDesc)
        .helpCommand(false);

      buildResourceCommands(subCmd, subResource, doc, config);
    }
  }
}

