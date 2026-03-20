/**
 * skill command: install and list Agent Skills
 *
 * anygen skill install [--platform openclaw|claude-code] [--dir <path>] [--name <names>] [--yes]
 * anygen skill list [--format json]
 * anygen skill generate [--output <dir>]  (dev, hidden)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import { parse as parseYaml } from 'yaml';
import { generateAllSkillFiles } from '../skills/generator.js';
import { validationError, outputError } from '../errors.js';
import { promptMultiSelect, promptConfirm } from '../utils/prompt.js';

/** Bundled skills directory (shipped with the npm package) */
const BUNDLED_SKILLS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../skills',
);

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

const PLATFORM_KEYS = Object.keys(PLATFORMS);

/** Parse YAML frontmatter from SKILL.md content */
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return parseYaml(match[1]) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Read all bundled skills and return their metadata */
async function readBundledSkills(): Promise<Array<{ dir: string; name: string; description: string }>> {
  const entries = await fs.readdir(BUNDLED_SKILLS_DIR, { withFileTypes: true });
  const skills: Array<{ dir: string; name: string; description: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMd = path.join(BUNDLED_SKILLS_DIR, entry.name, 'SKILL.md');
    try {
      const content = await fs.readFile(skillMd, 'utf-8');
      const fm = parseFrontmatter(content);
      skills.push({
        dir: entry.name,
        name: (fm.name as string) || entry.name,
        description: (fm.description as string) || '',
      });
    } catch {
      // skip directories without SKILL.md
    }
  }

  return skills.sort((a, b) => a.dir.localeCompare(b.dir));
}

export function buildSkillCommand(program: Command): void {
  const skillCmd = program
    .command('skill')
    .description('Manage AnyGen skills')
    .helpCommand(false);

  const platformChoices = PLATFORM_KEYS.join(', ');

  skillCmd
    .command('install')
    .description('Install skill files to an agent platform')
    .option(
      '--platform <name>',
      `Target platform (${platformChoices})`,
    )
    .option(
      '--dir <path>',
      'Custom install directory (overrides --platform)',
    )
    .option(
      '-y, --yes',
      'Skip confirmation prompt',
    )
    .action(async (opts) => {
      // Resolve target platforms
      interface Target { key: string; dir: string; label: string }
      let targets: Target[];

      if (opts.dir) {
        targets = [{ key: 'custom', dir: path.resolve(opts.dir), label: opts.dir }];
      } else if (opts.platform) {
        // --platform supports comma-separated: --platform openclaw,claude-code
        const keys = (opts.platform as string).split(',').map((s: string) => s.trim());
        targets = [];
        for (const k of keys) {
          const p = PLATFORMS[k];
          if (!p) outputError(validationError(`Unknown platform "${k}".`, `Available: ${platformChoices}`));
          targets.push({ key: k, dir: p.dir, label: p.label });
        }
      } else if (opts.yes) {
        // -y without --platform: install to all platforms
        targets = PLATFORM_KEYS.map((k) => ({ key: k, dir: PLATFORMS[k].dir, label: PLATFORMS[k].label }));
      } else {
        // Interactive: multi-select platforms (all checked by default)
        const selected = await promptMultiSelect(
          'Select target platforms:',
          PLATFORM_KEYS.map((k) => ({
            label: PLATFORMS[k].label,
            value: k,
            hint: PLATFORMS[k].dir,
            checked: true,
          })),
        );
        if (selected.length === 0) {
          process.stderr.write('\nNo platform selected.\n');
          process.exit(0);
        }
        targets = selected.map((k) => ({ key: k, dir: PLATFORMS[k].dir, label: PLATFORMS[k].label }));
      }

      // Read bundled skills (always install all)
      const allSkills = await readBundledSkills();
      const skillDirs = allSkills.map((s) => s.dir);

      // Show skills and confirm
      if (!opts.yes) {
        const targetNames = targets.map((t) => t.label).join(', ');
        const displaySkills = allSkills.filter((s) => skillDirs.includes(s.dir));
        process.stderr.write(`\n  Skills to install:\n`);
        for (const s of displaySkills) {
          const shortDesc = s.description.split(':').pop()?.trim().split('.')[0] || '';
          process.stderr.write(`    \x1b[36m${s.name}\x1b[0m`);
          if (shortDesc) process.stderr.write(`  \x1b[2m${shortDesc}\x1b[0m`);
          process.stderr.write('\n');
        }
        process.stderr.write(`\n  Target: ${targetNames}\n\n`);
        const confirmed = await promptConfirm('Proceed?');
        if (!confirmed) {
          process.stderr.write('\nCancelled.\n');
          process.exit(0);
        }
      }

      // Install to each platform
      for (const target of targets) {
        process.stderr.write(`\n  ${target.label} (${target.dir})\n`);
        let fileCount = 0;
        for (const skillDir of skillDirs) {
          const srcDir = path.join(BUNDLED_SKILLS_DIR, skillDir);
          const dstDir = path.join(target.dir, skillDir);

          const files = await fs.readdir(srcDir);
          for (const file of files) {
            const srcFile = path.join(srcDir, file);
            const dstFile = path.join(dstDir, file);
            const stat = await fs.stat(srcFile);
            if (stat.isFile()) {
              await fs.mkdir(dstDir, { recursive: true });
              await fs.copyFile(srcFile, dstFile);
              fileCount++;
            }
          }
          process.stderr.write(`    \x1b[32m✓\x1b[0m ${skillDir}\n`);
        }
        process.stderr.write(`  ${skillDirs.length} skills (${fileCount} files)\n`);
      }

      process.stderr.write('\nDone.\n');
    });

  skillCmd
    .command('list')
    .description('List available skills')
    .option('--format <type>', 'Output format: table | json', 'table')
    .action(async (opts) => {
      const skills = await readBundledSkills();

      if (opts.format === 'json') {
        const data = skills.map((s) => ({
          name: s.name,
          description: s.description,
        }));
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log('Available AnyGen skills:\n');
        const opSkills = skills.filter((s) => s.dir !== 'anygen-shared');
        const maxName = Math.max(...opSkills.map((s) => s.name.length), 5);
        const nameWidth = maxName + 2;
        console.log(`  ${'Skill'.padEnd(nameWidth)}Description`);
        console.log(`  ${'─'.repeat(nameWidth - 2)}  ${'─'.repeat(40)}`);
        for (const s of opSkills) {
          const desc = s.description.split('—')[0].trim();
          const truncated = desc.length > 50 ? desc.slice(0, 47) + '...' : desc;
          console.log(`  ${s.name.padEnd(nameWidth)}${truncated}`);
        }
        console.log('');
        console.log(`Total: ${opSkills.length} skills (+ anygen-shared)`);
        console.log(`\nInstall: anygen skill install [--platform <${platformChoices}>]`);
      }
    });

  // Hidden: generate skill files (for development)
  skillCmd
    .command('generate', { hidden: true })
    .description('Generate skill files (dev)')
    .option('--output <dir>', 'Output directory', BUNDLED_SKILLS_DIR)
    .action(async (opts) => {
      const outputDir = path.resolve(opts.output);
      const files = generateAllSkillFiles();

      for (const file of files) {
        const filePath = path.join(outputDir, file.path);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, file.content, 'utf-8');
      }

      const skillDirs = new Set(files.map((f) => f.path.split('/')[0]));
      process.stderr.write(`Generated ${skillDirs.size} skills (${files.length} files) to ${outputDir}\n`);
      for (const d of [...skillDirs].sort()) {
        process.stderr.write(`  ${d}/\n`);
      }
    });
}
