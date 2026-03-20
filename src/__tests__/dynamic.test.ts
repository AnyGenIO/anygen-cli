import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { buildDynamicCommands } from '../commands/dynamic.js';
import { buildSchemaCommand } from '../commands/schema-cmd.js';
import type { DiscoveryDocument } from '../discovery/types.js';

function makeTestDoc(): DiscoveryDocument {
  return {
    name: 'anygen',
    version: 'v1',
    title: 'AnyGen OpenAPI',
    description: 'Test discovery doc',
    baseUrl: 'https://test.example.com',
    parameters: {
      Authorization: {
        location: 'header',
        type: 'string',
        required: true,
        description: 'Auth header',
      },
    },
    resources: {
      task: {
        methods: {
          create: {
            id: 'task.create',
            description: 'Create a task',
            httpMethod: 'POST',
            path: '/v1/openapi/tasks',
            request: {
              type: 'object',
              properties: {
                operation: { type: 'string', description: 'Operation type', required: true },
                prompt: { type: 'string', description: 'Prompt text', required: true },
              },
            },
          },
          get: {
            id: 'task.get',
            description: 'Get task status',
            httpMethod: 'GET',
            path: '/v1/openapi/tasks/:task_id',
            parameters: {
              task_id: {
                location: 'path',
                type: 'string',
                required: true,
                description: 'Task ID',
              },
            },
          },
        },
      },
    },
  };
}

describe('buildDynamicCommands', () => {
  it('should create resource and method subcommands', () => {
    const program = new Command('anygen');
    const doc = makeTestDoc();
    const config = { baseUrl: 'https://test.example.com', apiKey: 'sk-test', apiKeySource: 'config' as const };

    buildDynamicCommands(program, doc, config);

    // 'task' resource should exist
    const taskCmd = program.commands.find((c) => c.name() === 'task');
    expect(taskCmd).toBeDefined();

    // 'create' and 'get' methods should exist under 'task'
    const createCmd = taskCmd!.commands.find((c) => c.name() === 'create');
    const getCmd = taskCmd!.commands.find((c) => c.name() === 'get');
    expect(createCmd).toBeDefined();
    expect(getCmd).toBeDefined();
  });

  it('should not expose global parameters as CLI options', () => {
    const program = new Command('anygen');
    const doc = makeTestDoc();
    const config = { baseUrl: 'https://test.example.com', apiKey: 'sk-test', apiKeySource: 'config' as const };

    buildDynamicCommands(program, doc, config);

    const taskCmd = program.commands.find((c) => c.name() === 'task');
    const createCmd = taskCmd!.commands.find((c) => c.name() === 'create');

    // Global Authorization parameter should not appear as a CLI option
    const options = createCmd!.options.map((o) => o.long);
    expect(options).not.toContain('--authorization');
  });

  it('should add --data option for methods with request body', () => {
    const program = new Command('anygen');
    const doc = makeTestDoc();
    const config = { baseUrl: 'https://test.example.com', apiKey: 'sk-test', apiKeySource: 'config' as const };

    buildDynamicCommands(program, doc, config);

    const taskCmd = program.commands.find((c) => c.name() === 'task');
    const createCmd = taskCmd!.commands.find((c) => c.name() === 'create');

    const options = createCmd!.options.map((o) => o.long);
    expect(options).toContain('--data');
    expect(options).not.toContain('--params');
  });

  it('should add --params for URL parameters and no --data when no request body', () => {
    const program = new Command('anygen');
    const doc = makeTestDoc();
    const config = { baseUrl: 'https://test.example.com', apiKey: 'sk-test', apiKeySource: 'config' as const };

    buildDynamicCommands(program, doc, config);

    const taskCmd = program.commands.find((c) => c.name() === 'task');
    const getCmd = taskCmd!.commands.find((c) => c.name() === 'get');

    const options = getCmd!.options.map((o) => o.long);
    expect(options).toContain('--params');
    expect(options).not.toContain('--data');
    expect(options).not.toContain('--task-id');
  });
});

describe('buildSchemaCommand', () => {
  it('should register schema command', () => {
    const program = new Command('anygen');
    const doc = makeTestDoc();

    buildSchemaCommand(program, doc);

    const schemaCmd = program.commands.find((c) => c.name() === 'schema');
    expect(schemaCmd).toBeDefined();
  });
});
