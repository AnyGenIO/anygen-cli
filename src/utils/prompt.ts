/**
 * Interactive terminal prompts with arrow-key navigation.
 * No external dependencies — uses raw stdin keypress handling.
 */

const isInteractive = process.stdin.isTTY ?? false;

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const ESC = '\x1b';
const CLEAR_LINE = `${ESC}[2K`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CYAN = `${ESC}[36m`;
const DIM = `${ESC}[2m`;
const BOLD = `${ESC}[1m`;
const GREEN = `${ESC}[32m`;
const RESET = `${ESC}[0m`;

function moveUp(n: number): string {
  return n > 0 ? `${ESC}[${n}A` : '';
}

// ---------------------------------------------------------------------------
// Select (single choice with arrow keys)
// ---------------------------------------------------------------------------

export interface SelectOption {
  label: string;
  value: string;
  hint?: string;
}

/**
 * Single-select prompt with arrow key navigation.
 * Returns the selected option's value.
 */
export function promptSelect(
  message: string,
  options: SelectOption[],
): Promise<string> {
  if (!isInteractive) {
    // Non-interactive: return first option
    return Promise.resolve(options[0].value);
  }

  return new Promise((resolve) => {
    let cursor = 0;
    const out = process.stderr;

    function render() {
      let output = '';
      // Move cursor up to overwrite previous render (except first time)
      output += moveUp(options.length);

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const selected = i === cursor;
        const pointer = selected ? `${CYAN}❯${RESET}` : ' ';
        const label = selected ? `${BOLD}${opt.label}${RESET}` : `${DIM}${opt.label}${RESET}`;
        const hint = opt.hint ? `  ${DIM}${opt.hint}${RESET}` : '';
        output += `${CLEAR_LINE}\r  ${pointer} ${label}${hint}\n`;
      }

      out.write(output);
    }

    // Print message and initial render
    out.write(`${BOLD}${message}${RESET}\n`);
    out.write(HIDE_CURSOR);
    // Print blank lines first so moveUp works on first render
    for (let i = 0; i < options.length; i++) {
      out.write('\n');
    }
    render();

    process.stdin.setRawMode(true);
    process.stdin.resume();

    function onData(buf: Buffer) {
      const key = buf.toString();

      // Arrow up / k
      if (key === `${ESC}[A` || key === 'k') {
        cursor = (cursor - 1 + options.length) % options.length;
        render();
        return;
      }

      // Arrow down / j
      if (key === `${ESC}[B` || key === 'j') {
        cursor = (cursor + 1) % options.length;
        render();
        return;
      }

      // Enter — confirm
      if (key === '\r' || key === '\n') {
        cleanup();
        out.write(SHOW_CURSOR);
        // Rewrite final state: show selected item
        out.write(moveUp(options.length));
        for (let i = 0; i < options.length; i++) {
          out.write(`${CLEAR_LINE}\r`);
          if (i < options.length - 1) out.write('\n');
        }
        out.write(moveUp(options.length - 1));
        out.write(`${CLEAR_LINE}\r  ${GREEN}✓${RESET} ${options[cursor].label}\n`);
        resolve(options[cursor].value);
        return;
      }

      // Ctrl+C — abort
      if (key === '\x03') {
        cleanup();
        out.write(SHOW_CURSOR);
        process.exit(0);
      }
    }

    function cleanup() {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    process.stdin.on('data', onData);
  });
}

// ---------------------------------------------------------------------------
// Multi-select (checkboxes with space toggle, arrow keys, enter to confirm)
// ---------------------------------------------------------------------------

export interface MultiSelectOption {
  label: string;
  value: string;
  hint?: string;
  checked?: boolean;
  /** If true, this option is always checked and cannot be toggled */
  fixed?: boolean;
}

/**
 * Multi-select prompt with checkboxes.
 * Space to toggle, 'a' to toggle all, Enter to confirm.
 * Returns array of selected values.
 */
export function promptMultiSelect(
  message: string,
  options: MultiSelectOption[],
): Promise<string[]> {
  if (!isInteractive) {
    return Promise.resolve(
      options.filter((o) => o.checked !== false).map((o) => o.value),
    );
  }

  return new Promise((resolve) => {
    let cursor = 0;
    const checked = options.map((o) => o.checked !== false);
    const out = process.stderr;

    // Total lines rendered: options + 1 hint line
    const totalLines = options.length + 1;

    function render() {
      let output = '';
      output += moveUp(totalLines);

      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const isCursor = i === cursor;
        const pointer = isCursor ? `${CYAN}❯${RESET}` : ' ';
        const box = checked[i]
          ? `${GREEN}◼${RESET}`
          : `${DIM}◻${RESET}`;
        const label = isCursor
          ? `${BOLD}${opt.label}${RESET}`
          : opt.fixed
            ? `${DIM}${opt.label} (required)${RESET}`
            : `${opt.label}`;
        const hint = opt.hint ? `  ${DIM}${opt.hint}${RESET}` : '';
        output += `${CLEAR_LINE}\r  ${pointer} ${box} ${label}${hint}\n`;
      }

      const count = checked.filter(Boolean).length;
      output += `${CLEAR_LINE}\r  ${DIM}↑↓ navigate · space toggle · a toggle all · enter confirm (${count} selected)${RESET}\n`;

      out.write(output);
    }

    out.write(`${BOLD}${message}${RESET}\n`);
    out.write(HIDE_CURSOR);
    for (let i = 0; i < totalLines; i++) {
      out.write('\n');
    }
    render();

    process.stdin.setRawMode(true);
    process.stdin.resume();

    function onData(buf: Buffer) {
      const key = buf.toString();

      // Arrow up / k
      if (key === `${ESC}[A` || key === 'k') {
        cursor = (cursor - 1 + options.length) % options.length;
        render();
        return;
      }

      // Arrow down / j
      if (key === `${ESC}[B` || key === 'j') {
        cursor = (cursor + 1) % options.length;
        render();
        return;
      }

      // Space — toggle current
      if (key === ' ') {
        if (!options[cursor].fixed) {
          checked[cursor] = !checked[cursor];
        }
        render();
        return;
      }

      // 'a' — toggle all (non-fixed)
      if (key === 'a') {
        const nonFixed = options.map((o, i) => (!o.fixed ? i : -1)).filter((i) => i >= 0);
        const allChecked = nonFixed.every((i) => checked[i]);
        for (const i of nonFixed) {
          checked[i] = !allChecked;
        }
        render();
        return;
      }

      // Enter — confirm
      if (key === '\r' || key === '\n') {
        cleanup();
        out.write(SHOW_CURSOR);
        // Move up to first option line and clear everything
        out.write(moveUp(totalLines));
        for (let i = 0; i < totalLines; i++) {
          out.write(`${CLEAR_LINE}\r\n`);
        }
        // Also clear the line cursor is now on
        out.write(`${CLEAR_LINE}\r`);
        // Move back up to where the message was
        out.write(moveUp(totalLines));
        // Show selected items summary
        const selected = options.filter((_, i) => checked[i]);
        if (selected.length > 0) {
          out.write(`  ${GREEN}✓${RESET} ${selected.map((s) => s.label).join(', ')}\n`);
        }
        resolve(selected.map((s) => s.value));
        return;
      }

      // Ctrl+C
      if (key === '\x03') {
        cleanup();
        out.write(SHOW_CURSOR);
        process.exit(0);
      }
    }

    function cleanup() {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    process.stdin.on('data', onData);
  });
}

// ---------------------------------------------------------------------------
// Confirm (Y/n)
// ---------------------------------------------------------------------------

/**
 * Confirm prompt. Returns true if user accepts.
 */
export function promptConfirm(message: string): Promise<boolean> {
  if (!isInteractive) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const out = process.stderr;
    out.write(`${BOLD}${message}${RESET} ${DIM}(Y/n)${RESET} `);

    process.stdin.setRawMode(true);
    process.stdin.resume();

    function onData(buf: Buffer) {
      const key = buf.toString().toLowerCase();

      if (key === '\r' || key === '\n' || key === 'y') {
        cleanup();
        out.write(`${GREEN}Yes${RESET}\n`);
        resolve(true);
        return;
      }

      if (key === 'n') {
        cleanup();
        out.write(`No\n`);
        resolve(false);
        return;
      }

      // Ctrl+C
      if (key === '\x03') {
        cleanup();
        out.write('\n');
        process.exit(0);
      }
    }

    function cleanup() {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    process.stdin.on('data', onData);
  });
}
