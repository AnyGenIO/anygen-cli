import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { toCamelCase, buildDynamicCommands, buildSchemaCommand } from '../commands/dynamic.js';
import type { DiscoveryDocument } from '../discovery/types.js';

describe('toCamelCase', () => {
  it('should convert kebab-case to camelCase', () => {
    expect(toCamelCase('task-id')).toBe('taskId');
  });

  it('should handle multiple hyphens', () => {
    expect(toCamelCase('my-long-flag')).toBe('myLongFlag');
  });

  it('should handle no hyphens', () => {
    expect(toCamelCase('simple')).toBe('simple');
  });

  it('should handle single character segments', () => {
    expect(toCamelCase('a-b-c')).toBe('aBC');
  });
});

function makeTestDoc(): DiscoveryDocument {
  return {
    name: 'anygen',
    version: 'v1',
    title: 'AnyGen OpenAPI',
    description: 'Test discovery doc',
    baseUrl: 'https://test.example.com',
    resources: {
      task: {
        methods: {
          create: {
            id: 'task.create',
            description: 'Create a task',
            httpMethod: 'POST',
            path: '/v1/openapi/tasks',
            parameters: [
              {
                name: 'Authorization',
                location: 'header',
                type: 'string',
                required: true,
                description: 'Auth header',
              },
            ],
            request: {
              type: 'object',
              properties: {
                operation: { type: 'string', description: 'Operation type' },
                prompt: { type: 'string', description: 'Prompt text' },
              },
              required: ['operation', 'prompt'],
            },
          },
          get: {
            id: 'task.get',
            description: 'Get task status',
            httpMethod: 'GET',
            path: '/v1/openapi/tasks/:task_id',
            parameters: [
              {
                name: 'task_id',
                location: 'path',
                type: 'string',
                required: true,
                description: 'Task ID',
              },
            ],
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

  it('should skip Authorization parameter', () => {
    const program = new Command('anygen');
    const doc = makeTestDoc();
    const config = { baseUrl: 'https://test.example.com', apiKey: 'sk-test', apiKeySource: 'config' as const };

    buildDynamicCommands(program, doc, config);

    const taskCmd = program.commands.find((c) => c.name() === 'task');
    const createCmd = taskCmd!.commands.find((c) => c.name() === 'create');

    // Authorization should not appear as a CLI option
    const options = createCmd!.options.map((o) => o.long);
    expect(options).not.toContain('--authorization');
  });

  it('should add --params option for methods with request body', () => {
    const program = new Command('anygen');
    const doc = makeTestDoc();
    const config = { baseUrl: 'https://test.example.com', apiKey: 'sk-test', apiKeySource: 'config' as const };

    buildDynamicCommands(program, doc, config);

    const taskCmd = program.commands.find((c) => c.name() === 'task');
    const createCmd = taskCmd!.commands.find((c) => c.name() === 'create');

    const options = createCmd!.options.map((o) => o.long);
    expect(options).toContain('--params');
  });

  it('should add --raw option to all methods', () => {
    const program = new Command('anygen');
    const doc = makeTestDoc();
    const config = { baseUrl: 'https://test.example.com', apiKey: 'sk-test', apiKeySource: 'config' as const };

    buildDynamicCommands(program, doc, config);

    const taskCmd = program.commands.find((c) => c.name() === 'task');
    const getCmd = taskCmd!.commands.find((c) => c.name() === 'get');

    const options = getCmd!.options.map((o) => o.long);
    expect(options).toContain('--raw');
  });

  it('should add path parameters as required options', () => {
    const program = new Command('anygen');
    const doc = makeTestDoc();
    const config = { baseUrl: 'https://test.example.com', apiKey: 'sk-test', apiKeySource: 'config' as const };

    buildDynamicCommands(program, doc, config);

    const taskCmd = program.commands.find((c) => c.name() === 'task');
    const getCmd = taskCmd!.commands.find((c) => c.name() === 'get');

    const options = getCmd!.options.map((o) => o.long);
    expect(options).toContain('--task-id');
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
