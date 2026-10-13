import type { Project } from '../../types';
import { METRICS, pageGeometry } from '../../pagination/metrics';
import { paginate } from '../../pagination/paginate';
import { dualMetrics } from '../../pagination/dual';

/** Texto plano monoespaciado, con la misma paginación que la vista y el PDF. */
export function exportPlainText(project: Project): string {
  const { pages } = paginate(project.elements, project.settings);
  const geo = pageGeometry(project.settings.pageSize);
  const out: string[] = [];
  const col = (inches: number) => Math.round((inches - 1.5) * 10);

  pages.forEach((page, idx) => {
    if (idx > 0) {
      out.push('\f');
      out.push(' '.repeat(col(geo.rightEdge) - String(page.number).length - 1) + `${page.number}.`, '');
    }
    // Cada línea de la página se arma por columnas (el diálogo dual comparte líneas).
    const rows: string[] = [];
    for (const block of page.blocks) {
      const metrics = block.synthetic ? METRICS.character : block.dual ? dualMetrics(block.dual, block.type) : METRICS[block.type];
      block.lines.forEach((line, i) => {
        let indent = col(metrics.left);
        if (metrics.align === 'right') indent = col(geo.rightEdge) - line.length;
        if (metrics.align === 'center') indent = Math.max(0, Math.round((60 - line.length) / 2));
        const row = rows[block.line + i] ?? '';
        rows[block.line + i] = row.padEnd(Math.max(0, indent)) + line;
      });
    }
    for (let r = 0; r < rows.length; r++) out.push(rows[r] ?? '');
  });
  return out.join('\n') + '\n';
}

export function exportJSON(project: Project): string {
  return JSON.stringify({ format: 'ampux', version: 1, project }, null, 2);
}

export function importJSON(text: string): Project {
  const data = JSON.parse(text);
  const project: Project | undefined = data?.format === 'ampux' ? data.project : data;
  if (!project || !Array.isArray(project.elements)) throw new Error('Archivo JSON inválido');
  return project;
}
