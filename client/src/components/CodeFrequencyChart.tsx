import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface TimeSeriesPoint {
  date: string;
  additions: number;
  deletions: number;
  commitCount: number;
}

interface Props {
  data: TimeSeriesPoint[];
}

export default function CodeFrequencyChart({ data }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = 400;
    const margin = { top: 20, right: 20, bottom: 40, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const parsed = data.map((d) => ({
      ...d,
      date: new Date(d.date + 'T00:00:00Z'),
    }));

    const maxVal = d3.max(parsed, (d) => Math.max(d.additions, d.deletions)) ?? 1;

    const xScale = d3
      .scaleUtc()
      .domain(d3.extent(parsed, (d) => d.date) as [Date, Date])
      .range([0, innerWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([-maxVal * 1.1, maxVal * 1.1])
      .range([innerHeight, 0]);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .call(
        d3.axisLeft(yScale)
          .tickSize(-innerWidth)
          .tickFormat(() => '')
      )
      .call((gg) => {
        gg.select('.domain').remove();
        gg.selectAll('.tick line')
          .attr('stroke', '#21262d')
          .attr('stroke-dasharray', '3,3');
      });

    // Zero line
    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', yScale(0))
      .attr('y2', yScale(0))
      .attr('stroke', '#30363d')
      .attr('stroke-width', 1);

    // Additions area (positive)
    const additionsArea = d3
      .area<(typeof parsed)[0]>()
      .x((d) => xScale(d.date))
      .y0(yScale(0))
      .y1((d) => yScale(d.additions))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(parsed)
      .attr('fill', '#3fb950')
      .attr('fill-opacity', 0.3)
      .attr('stroke', '#3fb950')
      .attr('stroke-width', 1.5)
      .attr('d', additionsArea);

    // Deletions area (negative)
    const deletionsArea = d3
      .area<(typeof parsed)[0]>()
      .x((d) => xScale(d.date))
      .y0(yScale(0))
      .y1((d) => yScale(-d.deletions))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(parsed)
      .attr('fill', '#f85149')
      .attr('fill-opacity', 0.3)
      .attr('stroke', '#f85149')
      .attr('stroke-width', 1.5)
      .attr('d', deletionsArea);

    // X axis
    const spanDays = parsed.length > 1
      ? (parsed[parsed.length - 1].date.getTime() - parsed[0].date.getTime()) / 86400000
      : 0;
    const tickFmt = spanDays > 180 ? '%b %Y' : '%b %d';
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(Math.min(parsed.length, 12))
          .tickFormat((d) => d3.utcFormat(tickFmt)(d as Date))
      )
      .call((gg) => {
        gg.select('.domain').attr('stroke', '#30363d');
        gg.selectAll('.tick line').attr('stroke', '#30363d');
        gg.selectAll('.tick text').attr('fill', '#8b949e').attr('font-size', '0.75rem');
      });

    // Y axis
    g.append('g')
      .call(
        d3.axisLeft(yScale)
          .ticks(6)
          .tickFormat((d) => {
            const v = Number(d);
            return v < 0 ? `-${Math.abs(v).toLocaleString()}` : v.toLocaleString();
          })
      )
      .call((gg) => {
        gg.select('.domain').attr('stroke', '#30363d');
        gg.selectAll('.tick line').attr('stroke', '#30363d');
        gg.selectAll('.tick text').attr('fill', '#8b949e').attr('font-size', '0.75rem');
      });

    // Y axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -48)
      .attr('text-anchor', 'middle')
      .attr('fill', '#8b949e')
      .attr('font-size', '0.75rem')
      .text('Lines changed');

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

    // Overlay for mouse events
    const bisect = d3.bisector((d: (typeof parsed)[0]) => d.date).left;

    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .on('mousemove', (event: MouseEvent) => {
        const [mx] = d3.pointer(event);
        const x0 = xScale.invert(mx);
        const idx = bisect(parsed, x0, 1);
        const d0 = parsed[idx - 1];
        const d1 = parsed[idx];
        const d = !d1 || (x0.getTime() - d0.date.getTime() < d1.date.getTime() - x0.getTime()) ? d0 : d1;
        if (!d) return;
        const net = d.additions - d.deletions;
        tooltip
          .style('opacity', '1')
          .style('left', `${event.offsetX + 16}px`)
          .style('top', `${event.offsetY - 8}px`)
          .html(
            `<div style="font-weight:600;margin-bottom:4px">${d3.utcFormat('%b %d, %Y')(d.date)}</div>` +
            `<div style="color:#3fb950">+${d.additions.toLocaleString()} additions</div>` +
            `<div style="color:#f85149">-${d.deletions.toLocaleString()} deletions</div>` +
            `<div style="color:${net >= 0 ? '#3fb950' : '#f85149'}">net ${net >= 0 ? '+' : ''}${net.toLocaleString()}</div>` +
            `<div style="color:#8b949e">${d.commitCount} commit${d.commitCount !== 1 ? 's' : ''}</div>`
          );
      })
      .on('mouseleave', () => tooltip.style('opacity', '0'));

    return () => {
      tooltip.remove();
    };
  }, [data]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg ref={svgRef} style={{ display: 'block' }} />
      {data.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#8b949e' }}>
          No time series data available
        </div>
      )}
    </div>
  );
}
