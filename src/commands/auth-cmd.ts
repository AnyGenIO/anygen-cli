/**
 * auth command: authenticate with AnyGen
 *
 * anygen auth login                  — web login or verify existing key
 * anygen auth login --api-key sk-xxx — configure and verify a specific key
 * anygen auth login --no-wait        — get auth URL and exit without polling
 * anygen auth status                 — show current auth status
 * anygen auth logout                 — remove stored key
 */

import { Command } from 'commander';
import { loadConfig, saveApiKey, saveFetchToken, removeApiKey } from '../config/config.js';
import { verifyKey, getKey, waitForKey, maskKey, isVerifyError, parseCredits, SOURCE_LABELS } from '../api/auth.js';
import { authError, networkError, apiError, outputError } from '../errors.js';

export function buildAuthCommand(program: Command): void {
  const authCmd = program
    .command('auth')
    .description('Authenticate with AnyGen')
    .helpCommand(false);

  authCmd
    .command('login')
    .description('Authenticate via web login or API key')
    .option('--api-key <key>', 'Configure and verify a specific API key')
    .option('--no-wait', 'Get auth URL and exit without waiting for authorization')
    .action(async (opts: { apiKey?: string; wait?: boolean }) => {
      // Commander parses --no-wait as { wait: false }
      const noWait = opts.wait === false;
      await handleLogin(opts.apiKey, noWait);
    });

  authCmd
    .command('status')
    .description('Show current authentication status')
    .action(async () => {
      await handleStatus();
    });

  authCmd
    .command('logout')
    .description('Remove stored API key')
    .action(async () => {
      await handleLogout();
    });
}

async function handleLogin(apiKeyOverride?: string, noWait?: boolean): Promise<void> {
  const config = await loadConfig({ apiKey: apiKeyOverride });
  const currentKey = config.apiKey || undefined;

  // If we have a pending fetchToken, try to exchange it first
  if (!currentKey && config.fetchToken) {
    const fetchResult = await getKey(config.baseUrl, config.fetchToken);
    if (fetchResult?.allocated && fetchResult.api_key) {
      await saveApiKey(fetchResult.api_key);
      process.stderr.write('Authenticated successfully.\n');
      process.stderr.write(`  API Key:  ${maskKey(fetchResult.api_key)}\n`);
      process.stderr.write(`  Source:   ${SOURCE_LABELS['config']}\n`);
      return;
    }
    // fetchToken not ready or expired — continue to normal flow
  }

  const result = await verifyKey(config.baseUrl, currentKey);
  if (isVerifyError(result)) {
    if (result.error === 'server') {
      outputError(apiError(`Service unavailable (HTTP ${result.status}). Please try again later.`));
    } else {
      outputError(networkError('Failed to connect to AnyGen.'));
    }
  }

  // Key is valid
  if (result.verified) {
    const credits = parseCredits(result.credits);
    if (credits <= 0) {
      outputError(authError('API key is valid but has no credits remaining.'));
    }

    if (apiKeyOverride) {
      await saveApiKey(apiKeyOverride);
    }

    const displayKey = currentKey ? maskKey(currentKey) : '(from server)';
    process.stderr.write(`Authenticated successfully.\n`);
    process.stderr.write(`  API Key:  ${displayKey}\n`);
    process.stderr.write(`  Source:   ${SOURCE_LABELS[config.apiKeySource]}\n`);
    process.stderr.write(`  Credits:  ${credits}\n`);

    if (process.env.ANYGEN_API_KEY && config.apiKeySource !== 'env') {
      process.stderr.write('\nNote: ANYGEN_API_KEY environment variable is set and will take priority over the saved key.\n');
    }
    return;
  }

  // Not valid — enter login flow
  if (!result.auth_url || !result.fetch_token) {
    outputError(authError('API key is invalid.', 'Run: anygen auth login --api-key sk-xxx'));
  }

  // Persist fetchToken before printing URL — survives interruption
  await saveFetchToken(result.fetch_token);

  // --no-wait: print URL and exit immediately
  if (noWait) {
    process.stderr.write('Open this URL to authorize:\n');
    console.log(result.auth_url);
    return;
  }

  // Interactive mode: show URL and poll
  process.stderr.write('Open this URL to authorize:\n\n');
  process.stderr.write(`  ${result.auth_url}\n\n`);
  process.stderr.write('Waiting for authorization...\n');

  const key = await waitForKey(config.baseUrl, result.fetch_token);
  if (!key) {
    outputError(authError('Authorization failed or timed out.', 'Run: anygen auth login --api-key sk-xxx'));
  }

  process.stderr.write('\nYou can now use AnyGen CLI.\n');

  if (process.env.ANYGEN_API_KEY) {
    process.stderr.write('\nNote: ANYGEN_API_KEY environment variable is set and will take priority over the saved key.\n');
  }
}

async function handleStatus(): Promise<void> {
  const config = await loadConfig();

  if (!config.apiKey) {
    process.stderr.write('Not authenticated.\n');
    process.stderr.write('Run `anygen auth login` to authenticate.\n');
    return;
  }

  process.stderr.write(`API Key:  ${maskKey(config.apiKey)}\n`);
  process.stderr.write(`Source:   ${SOURCE_LABELS[config.apiKeySource]}\n`);

  const result = await verifyKey(config.baseUrl, config.apiKey);
  if (isVerifyError(result)) {
    if (result.error === 'server') {
      process.stderr.write(`Status:   Unable to verify (service unavailable, HTTP ${result.status})\n`);
    } else {
      process.stderr.write('Status:   Unable to verify (network error)\n');
    }
    return;
  }

  if (result.verified) {
    const credits = parseCredits(result.credits);
    process.stderr.write(`Status:   Valid\n`);
    process.stderr.write(`Credits:  ${credits}\n`);
  } else {
    process.stderr.write('Status:   Invalid\n');
    process.stderr.write('Run `anygen auth login` to re-authenticate.\n');
  }
}

async function handleLogout(): Promise<void> {
  await removeApiKey();
  process.stderr.write('API key removed from ~/.config/anygen/config.json\n');

  if (process.env.ANYGEN_API_KEY) {
    process.stderr.write('\nNote: ANYGEN_API_KEY environment variable is still set, commands will continue to use it.\n');
  }
}
