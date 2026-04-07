import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Contributor {
  login: string | null;
  name: string | null;
  avatarUrl: string;
  additions: number;
  deletions: number;
  commitCount: number;
}

interface Props {
  contributors: Contributor[];
}

const MAX_SHOWN = 20;

export default function ContributorsChart({ contributors }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || contributors.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const shown = contributors.slice(0, MAX_SHOWN);
    const rowHeight = 36;
    const labelWidth = 160;
    const margin = { top: 8, right: 20, bottom: 8, left: labelWidth };
    const innerWidth = width - margin.left - margin.right;
    const height = shown.length * rowHeight + margin.top + margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const maxTotal = d3.max(shown, (d) => d.additions + d.deletions) ?? 1;

    const xScale = d3.scaleLinear().domain([0, maxTotal]).range([0, innerWidth]);

    // Row groups
    const row = g
      .selectAll<SVGGElement, Contributor>('g.row')
      .data(shown)
      .join('g')
      .attr('class', 'row')
      .attr('transform', (_d, i) => `translate(0,${i * rowHeight})`);

    // Additions bar
    row
      .append('rect')
      .attr('x', 0)
      .attr('y', 8)
      .attr('height', rowHeight - 16)
      .attr('width', (d) => xScale(d.additions))
      .attr('fill', '#3fb950')
      .attr('fill-opacity', 0.7)
      .attr('rx', 2);

    // Deletions bar (stacked)
    row
      .append('rect')
      .attr('x', (d) => xScale(d.additions))
      .attr('y', 8)
      .attr('height', rowHeight - 16)
      .attr('width', (d) => xScale(d.deletions))
      .attr('fill', '#f85149')
      .attr('fill-opacity', 0.7)
      .attr('rx', 2);

    // Total label at end of bar
    row
      .append('text')
      .attr('x', (d) => xScale(d.additions + d.deletions) + 6)
      .attr('y', rowHeight / 2 + 4)
      .attr('fill', '#8b949e')
      .attr('font-size', '0.75rem')
      .text((d) => `±${(d.additions + d.deletions).toLocaleString()}`);

    // Author labels (left side)
    const labelG = svg
      .selectAll<SVGGElement, Contributor>('g.label')
      .data(shown)
      .join('g')
      .attr('class', 'label')
      .attr('transform', (_d, i) => `translate(0,${margin.top + i * rowHeight})`);

    labelG
      .append('text')
      .attr('x', labelWidth - 8)
      .attr('y', rowHeight / 2 + 4)
      .attr('text-anchor', 'end')
      .attr('fill', '#dfe2eb')
      .attr('font-size', '0.8125rem')
      .text((d) => {
        const name = d.login ?? d.name ?? 'unknown';
        return name.length > 18 ? name.slice(0, 16) + '…' : name;
      });

    // Tooltip
    const tooltip = d3
      .select(container)
      .append('div')
      .style('position', 'absolute')
      .style('background', '#161b22')
      .style('border', '1px solid #30363d')
      .style('border-radius', '6px')
      .style('padding', '8px 12px')
      .style('font-size', '0.8125rem')
      .style('color', '#dfe2eb')
      .style('pointer-events', 'none')
      .style('opacity', '0')
      .style('z-index', '10');

    row
      .on('mousemove', (event: MouseEvent, d) => {
        tooltip
          .style('opacity', '1')
          .style('left', `${event.offsetX + 12}px`)
          .style('top', `${event.offsetY - 8}px`)
          .html(
            `<div style="font-weight:600;margin-bottom:4px">${d.login ?? d.name ?? 'unknown'}</div>` +
            `<div style="color:#3fb950">+${d.additions.toLocaleString()} additions</div>` +
            `<div style="color:#f85149">-${d.deletions.toLocaleString()} deletions</div>` +
            `<div style="color:#8b949e">${d.commitCount} commit${d.commitCount !== 1 ? 's' : ''}</div>`
          );
      })
      .on('mouseleave', () => tooltip.style('opacity', '0'));

    return () => {
      tooltip.remove();
    };
  }, [contributors]);

  const shown = contributors.slice(0, MAX_SHOWN);
  const others = contributors.length - shown.length;

  return (
    <div>
      <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
        <svg ref={svgRef} style={{ display: 'block' }} />
        {contributors.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#8b949e' }}>
            No contributor data available
          </div>
        )}
      </div>
      {others > 0 && (
        <div style={{ padding: '0.5rem 0', color: '#8b949e', fontSize: '0.8125rem', textAlign: 'center' }}>
          + {others} other contributor{others !== 1 ? 's' : ''} (not shown)
        </div>
      )}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.8125rem', color: '#8b949e' }}>
        <span>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: '#3fb950', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />
          Additions
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 12, height: 12, background: '#f85149', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />
          Deletions
        </span>
      </div>
    </div>
  );
}
