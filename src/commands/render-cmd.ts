/**
 * render 命令：将 Excalidraw / DrawIO 内容渲染为 PNG
 *
 * anygen render excalidraw input.json output.png
 * anygen render drawio input.xml output.png
 * cat input.json | anygen render excalidraw - output.png
 * anygen render excalidraw input.json output.png --scale 3 --background '#f0f0f0'
 */

import * as fs from 'fs/promises';
import { Command } from 'commander';
import { renderDiagram, type DiagramType } from '../render/diagram.js';

export function buildRenderCommand(program: Command): void {
  program
    .command('render')
    .description('渲染图表为 PNG（支持 Excalidraw / DrawIO）')
    .argument('<type>', '图表类型: excalidraw | drawio')
    .argument('<input>', '输入文件路径（使用 "-" 从 stdin 读取）')
    .argument('<output>', '输出 PNG 文件路径')
    .option('--scale <n>', 'PNG 缩放因子', '2')
    .option('--background <hex>', '背景色', '#ffffff')
    .option('--padding <n>', '导出内边距 px', '20')
    .action(async (type: string, input: string, output: string, opts) => {
      // 校验 type
      if (type !== 'excalidraw' && type !== 'drawio') {
        console.error(`Error: 不支持的图表类型 "${type}"，可用: excalidraw, drawio`);
        process.exit(1);
      }

      // 读取内容
      let content: string;
      if (input === '-') {
        content = await readStdin();
      } else {
        try {
          content = await fs.readFile(input, 'utf-8');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Error: 无法读取文件 "${input}": ${msg}`);
          process.exit(1);
        }
      }

      if (!content.trim()) {
        console.error('Error: 输入内容为空');
        process.exit(1);
      }

      const scale = Number(opts.scale);
      const background = opts.background as string;
      const padding = Number(opts.padding);

      console.log(`Rendering ${type} → PNG (scale=${scale})...`);

      try {
        const result = await renderDiagram({
          type: type as DiagramType,
          content,
          scale,
          background,
          padding,
        });

        await fs.writeFile(output, result.data);
        const sizeKb = (result.data.length / 1024).toFixed(1);
        console.log(`Done: ${output} (${sizeKb} KB)`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error: 渲染失败: ${msg}`);
        console.error('');
        console.error('手动导出方式:');
        if (type === 'excalidraw') {
          console.error('  1. 打开 https://excalidraw.com');
          console.error(`  2. 导入文件: ${input}`);
          console.error('  3. Menu -> Export image -> PNG');
        } else {
          console.error('  1. 打开 https://app.diagrams.net');
          console.error(`  2. 导入文件: ${input}`);
          console.error('  3. File -> Export as -> PNG');
        }
        process.exit(1);
      }
    });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}
