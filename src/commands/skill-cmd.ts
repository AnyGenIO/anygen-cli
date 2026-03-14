/**
 * skill command: install and list Agent Skills
 *
 * anygen skill install [--platform openclaw|claude-code] [--dir <path>]
 * anygen skill list [--format json]
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Command } from 'commander';
import { generateAllSkillFiles } from '../skills/generator.js';
import { OPERATIONS } from '../skills/operations.js';

/** Well-known skill directories for supported platforms */
const PLATFORMS: Record<string, { dir: string; label: string }> = {
  openclaw: {
    dir: path.join(os.homedir(), '.openclaw', 'skills'),
    label: 'OpenClaw',
  },
  'claude-code': {
    dir: path.join(os.homedir(), '.claude', 'skills'),
    label: 'Claude Code',
  },
};

export function buildSkillCommand(program: Command): void {
  const skillCmd = program
    .command('skill')
    .description('Manage Agent Skills');

  const platformChoices = Object.keys(PLATFORMS).join(', ');

  skillCmd
    .command('install')
    .description('Install skill files to an agent platform')
    .option(
      '--platform <name>',
      `Target platform (${platformChoices})`,
      'openclaw',
    )
    .option(
      '--dir <path>',
      'Custom install directory (overrides --platform)',
    )
    .option(
      '--name <names>',
      'Install specific skills (comma-separated trackingNames, e.g. slide-generator,deep-research)',
    )
    .action(async (opts) => {
      let dir: string;
      let label: string;

      if (opts.dir) {
        dir = path.resolve(opts.dir);
        label = dir;
      } else {
        const platform = PLATFORMS[opts.platform];
        if (!platform) {
          console.error(`Error: Unknown platform "${opts.platform}". Available: ${platformChoices}`);
          process.exit(1);
        }
        dir = platform.dir;
        label = platform.label;
      }

      let files = generateAllSkillFiles();

      // Filter by --name
      if (opts.name) {
        const names = new Set(
          (opts.name as string).split(',').map((n: string) => n.trim()),
        );
        // Validate names
        const allTrackingNames = new Set(OPERATIONS.map((op) => op.trackingName));
        for (const n of names) {
          if (!allTrackingNames.has(n)) {
            console.error(`Error: Unknown skill "${n}". Run \`anygen skill list\` to see available skills.`);
            process.exit(1);
          }
        }
        // Always include main skill + matched standalone skills
        files = files.filter((f) => {
          if (f.path === 'anygen/SKILL.md') return true;
          const dirName = f.path.split('/')[0]; // e.g. "anygen-slide-generator"
          const trackingName = dirName.replace(/^anygen-/, '');
          return names.has(trackingName);
        });
      }

      console.log(`[INFO] Installing skills to ${label} (${dir})...`);

      for (const file of files) {
        const filePath = path.join(dir, file.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content, 'utf-8');
      }

      const skillDirs = new Set(files.map((f) => f.path.split('/')[0]));

      console.log(`[SUCCESS] Installed ${skillDirs.size} skills (${files.length} files) to ${dir}`);
      console.log('');
      for (const d of [...skillDirs].sort()) {
        console.log(`  ${d}/`);
      }
    });

  skillCmd
    .command('list')
    .description('List available skills')
    .option('--format <type>', 'Output format: table | json', 'table')
    .action(async (opts) => {
      if (opts.format === 'json') {
        const data = OPERATIONS.map((op) => ({
          name: op.name,
          title: op.title,
          content_type: op.contentName,
          estimated_time: op.estimatedTime,
        }));
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log('Available AnyGen skills:\n');
        console.log('  Skill            Type                    Time');
        console.log('  ───────────────  ──────────────────────  ──────────────');
        for (const op of OPERATIONS) {
          const name = op.name.padEnd(17);
          const title = op.title.padEnd(24);
          console.log(`  ${name}${title}${op.estimatedTime}`);
        }
        console.log('');
        console.log(`Total: ${OPERATIONS.length} skills`);
        console.log(`\nInstall: anygen skill install [--platform <${platformChoices}>]`);
      }
    });

  // Hidden: generate to arbitrary directory (for development)
  skillCmd
    .command('generate', { hidden: true })
    .description('Generate skill files to directory (dev)')
    .option('--output <dir>', 'Output directory', 'skills')
    .action(async (opts) => {
      const outputDir = path.resolve(opts.output);
      const files = generateAllSkillFiles();

      for (const file of files) {
        const filePath = path.join(outputDir, file.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content, 'utf-8');
      }

      const skillDirs = new Set(files.map((f) => f.path.split('/')[0]));
      console.log(`Generated ${skillDirs.size} skills (${files.length} files) to ${outputDir}`);
    });
}
