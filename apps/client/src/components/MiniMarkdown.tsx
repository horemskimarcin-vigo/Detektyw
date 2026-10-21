import type { ReactNode } from 'react';

/**
 * Bezpieczny renderer podzbioru Markdown (bez innerHTML):
 * nagłówki #, akapity, listy -, tabele |…|, linia ---, **pogrubienie**, *kursywa*.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    out.push(
      tok.startsWith('**') ? (
        <strong key={`${key}-${i++}`}>{tok.slice(2, -2)}</strong>
      ) : (
        <em key={`${key}-${i++}`}>{tok.slice(1, -1)}</em>
      ),
    );
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MiniMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const key = `b${k++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const Tag = `h${level + 2}` as 'h3' | 'h4' | 'h5';
      blocks.push(<Tag key={key}>{inline(h[2]!, key)}</Tag>);
      i++;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={key} />);
      i++;
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        const cells = lines[i]!.trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div className="table-wrap" key={key}>
          <table>
            {head && (
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th key={j} scope="col">
                      {inline(c, `${key}h${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j}>{inline(c, `${key}${ri}${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-•]\s+/.test(lines[i]!))
        items.push(lines[i++]!.replace(/^\s*[-•]\s+/, ''));
      blocks.push(
        <ul key={key}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|\||---|\s*[-•]\s)/.test(lines[i]!))
      para.push(lines[i++]!);
    blocks.push(
      <p key={key}>
        {para.flatMap((p, j) =>
          j === 0
            ? inline(p, `${key}${j}`)
            : [<br key={`${key}br${j}`} />, ...inline(p, `${key}${j}`)],
        )}
      </p>,
    );
  }
  return <>{blocks}</>;
}
