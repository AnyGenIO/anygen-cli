/**
 * auth command: authenticate with AnyGen
 *
 * anygen auth login                  — web login or verify existing key
 * anygen auth login --api-key sk-xxx — configure and verify a specific key
 * anygen auth status                 — show current auth status
 * anygen auth logout                 — remove stored key
 * anygen auth wait --fetch-token     — poll for key allocation (used by AI agents)
 */

import { Command } from 'commander';
import { loadConfig, saveApiKey, removeApiKey } from '../config/config.js';
import { verifyKey, waitForKey, maskKey } from '../api/auth.js';

const SOURCE_LABELS: Record<string, string> = {
  flag: '--api-key flag',
  env: 'ANYGEN_API_KEY env',
  config: '~/.config/anygen/config.json',
  none: '',
};

export function buildAuthCommand(program: Command): void {
  const authCmd = program
    .command('auth')
    .description('Authenticate with AnyGen');

  authCmd
    .command('login')
    .description('Authenticate via web login or API key')
    .option('--api-key <key>', 'Configure and verify a specific API key')
    .action(async (opts: { apiKey?: string }) => {
      await handleLogin(opts.apiKey);
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

  authCmd
    .command('wait')
    .description('Poll for API key allocation (used by AI agents)')
    .requiredOption('--fetch-token <token>', 'Fetch token from verify response')
    .option('--timeout <seconds>', 'Max wait time in seconds', '900')
    .option('--interval <seconds>', 'Polling interval in seconds', '10')
    .action(async (opts: { fetchToken: string; timeout: string; interval: string }) => {
      const timeoutMs = parseInt(opts.timeout, 10) * 1000;
      const intervalMs = parseInt(opts.interval, 10) * 1000;
      const key = await waitForKey(opts.fetchToken, timeoutMs, intervalMs);
      process.exit(key ? 0 : 1);
    });
}

async function handleLogin(apiKeyOverride?: string): Promise<void> {
  const config = await loadConfig({ apiKey: apiKeyOverride });
  const currentKey = config.apiKey || undefined;

  const result = await verifyKey(currentKey);
  if (!result) {
    console.error('Error: Failed to connect to AnyGen. Check your network connection.');
    process.exit(1);
  }

  // Key is valid
  if (result.verified) {
    const credits = parseInt(String(result.credits ?? '0'), 10) || 0;
    if (credits <= 0) {
      console.error('Error: API key is valid but has no credits remaining.');
      process.exit(1);
    }

    if (apiKeyOverride) {
      await saveApiKey(apiKeyOverride);
    }

    const displayKey = currentKey ? maskKey(currentKey) : '(from server)';
    console.log(`Authenticated successfully.`);
    console.log(`  API Key:  ${displayKey}`);
    console.log(`  Source:   ${SOURCE_LABELS[config.apiKeySource]}`);
    console.log(`  Credits:  ${credits}`);
    return;
  }

  // Not valid — enter login flow
  if (!result.auth_url || !result.fetch_token) {
    console.error('Error: API key is invalid. Please provide a valid key with --api-key.');
    process.exit(1);
  }

  console.log('No valid API key found. Opening web login...\n');
  console.log(`  Open this URL to authorize:`);
  console.log(`  ${result.auth_url}\n`);
  if (result.api_key_name) {
    console.log(`  This will create an API key named: ${result.api_key_name}`);
  }
  console.log('\nWaiting for authorization...');

  const key = await waitForKey(result.fetch_token);
  if (!key) {
    console.error('\nAuthorization failed or timed out.');
    console.error('You can also configure a key directly: anygen auth login --api-key sk-xxx');
    process.exit(1);
  }

  console.log('\nYou can now use AnyGen CLI.');
}

async function handleStatus(): Promise<void> {
  const config = await loadConfig();

  if (!config.apiKey) {
    console.log('Not authenticated.');
    console.log('Run `anygen auth login` to authenticate.');
    return;
  }

  console.log(`API Key:  ${maskKey(config.apiKey)}`);
  console.log(`Source:   ${SOURCE_LABELS[config.apiKeySource]}`);

  const result = await verifyKey(config.apiKey);
  if (!result) {
    console.log('Status:   Unable to verify (network error)');
    return;
  }

  if (result.verified) {
    const credits = parseInt(String(result.credits ?? '0'), 10) || 0;
    console.log(`Status:   Valid`);
    console.log(`Credits:  ${credits}`);
  } else {
    console.log('Status:   Invalid');
    console.log('Run `anygen auth login` to re-authenticate.');
  }
}

async function handleLogout(): Promise<void> {
  await removeApiKey();
  console.log('API key removed from ~/.config/anygen/config.json');

  if (process.env.ANYGEN_API_KEY) {
    console.log('');
    console.log('Note: ANYGEN_API_KEY environment variable is still set, commands will continue to use it.');
  }
}
