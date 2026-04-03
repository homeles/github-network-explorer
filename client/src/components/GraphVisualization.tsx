import { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { buildDag, calcGraphWidth, calcGraphHeight, GRAPH_CONSTANTS } from '../lib/dag.js';
import type { DagNode } from '../lib/dag.js';
import type { CommitNode } from '../lib/api.js';

const { NODE_RADIUS } = GRAPH_CONSTANTS;

// Color palette for lanes
const LANE_COLORS = [
  '#58a6ff', // main/master - blue
  '#3fb950', // develop - green
  '#bc8cff', // feature - purple
  '#d29922', // hotfix - yellow
  '#f85149', // release - red
  '#39d353', // other - light green
  '#ff7b72', // other - salmon
  '#79c0ff', // other - light blue
];

function getLaneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? '#58a6ff';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface Props {
  commits: CommitNode[];
  selectedOid: string | null;
  onSelectCommit: (oid: string) => void;
  branchMap?: Map<string, string>;
}

export default function GraphVisualization({
  commits,
  selectedOid,
  onSelectCommit,
  branchMap,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Persist zoom across re-renders
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const hasInitialFitRef = useRef(false);

  // Fingerprint commits by their OIDs so we know when the list truly changed
  const commitFingerprint = useMemo(
    () => commits.map((c) => c.oid).join(','),
    [commits]
  );
  const prevFingerprintRef = useRef('');

  // Pre-compute DAG nodes (pure, no side-effects)
  const nodes = useMemo(() => buildDag(commits, branchMap), [commits, branchMap]);

  useEffect(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    if (!svg || !container || !tooltip) return;
    if (nodes.length === 0) return;

    const commitsChanged = commitFingerprint !== prevFingerprintRef.current;
    prevFingerprintRef.current = commitFingerprint;

    const graphWidth = Math.max(calcGraphWidth(nodes), 60);
    const svgHeight = calcGraphHeight(nodes);
    const viewWidth = container.clientWidth;
    const viewHeight = container.clientHeight || 600;

    const d3svg = d3.select(svg);
    d3svg.selectAll('*').remove();

    d3svg
      .attr('width', viewWidth)
      .attr('height', viewHeight)
      .attr('viewBox', `0 0 ${viewWidth} ${viewHeight}`);

    // Zoom/pan group
    const g = d3svg.append('g').attr('class', 'zoom-group');

    // Create (or reuse) zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        zoomTransformRef.current = event.transform;
        g.attr('transform', String(event.transform));
      });

    zoomBehaviorRef.current = zoom;
    d3svg.call(zoom);

    // Build node lookup
    const nodeMap = new Map<string, DagNode>();
    for (const n of nodes) nodeMap.set(n.oid, n);

    // ─── Draw edges ───
    const edgeGroup = g.append('g').attr('class', 'edges');

    for (const node of nodes) {
      for (const parentRef of node.parents.nodes) {
        const parent = nodeMap.get(parentRef.oid);
        if (!parent) continue;

        const x1 = node.x;
        const y1 = node.y;
        const x2 = parent.x;
        const y2 = parent.y;
        const color = getLaneColor(node.lane);

        const midY = (y1 + y2) / 2;
        const d =
          x1 === x2
            ? `M ${x1} ${y1} L ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

        edgeGroup
          .append('path')
          .attr('d', d)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', 1.5)
          .attr('stroke-opacity', 0.6);
      }
    }

    // ─── Draw nodes ───
    const nodeGroup = g.append('g').attr('class', 'nodes');

    // Label area starts after the graph columns
    const labelX = graphWidth + 12;
    const rightPanelWidth = 600;
    const totalContentWidth = graphWidth + rightPanelWidth;

    for (const node of nodes) {
      const isSelected = node.oid === selectedOid;
      const color = getLaneColor(node.lane);
      const nodeG = nodeGroup
        .append('g')
        .attr('class', 'node')
        .attr('cursor', 'pointer')
        .attr('data-oid', node.oid)
        .on('click', () => onSelectCommit(node.oid));

      // Selected highlight ring
      if (isSelected) {
        nodeG
          .append('circle')
          .attr('cx', node.x)
          .attr('cy', node.y)
          .attr('r', NODE_RADIUS + 4)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', 2)
          .attr('stroke-opacity', 0.5);
      }

      if (node.isMerge) {
        const size = NODE_RADIUS;
        nodeG
          .append('polygon')
          .attr(
            'points',
            `${node.x},${node.y - size} ${node.x + size},${node.y} ${node.x},${node.y + size} ${node.x - size},${node.y}`
          )
          .attr('fill', isSelected ? color : '#161b22')
          .attr('stroke', color)
          .attr('stroke-width', 2);
      } else {
        nodeG
          .append('circle')
          .attr('cx', node.x)
          .attr('cy', node.y)
          .attr('r', NODE_RADIUS)
          .attr('fill', isSelected ? color : '#161b22')
          .attr('stroke', color)
          .attr('stroke-width', 2);
      }

      // SHA label
      nodeG
        .append('text')
        .attr('x', labelX)
        .attr('y', node.y)
        .attr('dy', '0.32em')
        .attr('fill', isSelected ? '#dfe2eb' : '#c0c7d4')
        .attr('font-size', '12px')
        .attr('font-family', 'monospace')
        .text(node.abbreviatedOid);

      // Commit subject
      const subject = node.message.split('\n')[0] ?? '';
      const truncated = subject.length > 60 ? subject.slice(0, 60) + '…' : subject;

      nodeG
        .append('text')
        .attr('x', labelX + 64)
        .attr('y', node.y)
        .attr('dy', '0.32em')
        .attr('fill', isSelected ? '#dfe2eb' : '#c0c7d4')
        .attr('font-size', '12px')
        .text(truncated);

      // Date
      nodeG
        .append('text')
        .attr('x', labelX + 64 + 460)
        .attr('y', node.y)
        .attr('dy', '0.32em')
        .attr('fill', '#8b949e')
        .attr('font-size', '11px')
        .text(formatDate(node.committedDate));

      // ─── Tooltip on hover ───
      nodeG
        .on('mouseover', function (event: MouseEvent) {
          // Highlight node
          d3.select(this).selectAll('circle, polygon').attr('fill', color);

          // Show tooltip
          const authorName = node.author?.name ?? 'Unknown';
          const authorLogin = node.author?.user?.login;
          const authorLine = authorLogin
            ? `${authorName} (@${authorLogin})`
            : authorName;
          const subjectFull = node.message.split('\n')[0] ?? '';

          tooltip.innerHTML = `
            <div style="font-weight:600;color:#dfe2eb;margin-bottom:4px;word-break:break-all">${subjectFull}</div>
            <div style="display:flex;gap:12px;font-size:11px;color:#8b949e;margin-bottom:2px">
              <span style="font-family:monospace;color:#58a6ff">${node.abbreviatedOid}</span>
              <span>${formatFullDate(node.committedDate)}</span>
            </div>
            <div style="font-size:11px;color:#c0c7d4">${authorLine}</div>
            <div style="font-size:11px;color:#8b949e;margin-top:2px">
              <span style="color:#3fb950">+${node.additions}</span>
              <span style="margin-left:6px;color:#f85149">−${node.deletions}</span>
              ${node.isMerge ? '<span style="margin-left:6px;color:#bc8cff">merge</span>' : ''}
            </div>
          `;
          tooltip.style.opacity = '1';
          tooltip.style.left = `${event.clientX + 12}px`;
          tooltip.style.top = `${event.clientY - 10}px`;
        })
        .on('mousemove', function (event: MouseEvent) {
          tooltip.style.left = `${event.clientX + 12}px`;
          tooltip.style.top = `${event.clientY - 10}px`;
        })
        .on('mouseout', function () {
          if (node.oid !== selectedOid) {
            d3.select(this)
              .selectAll('circle, polygon')
              .attr('fill', isSelected ? color : '#161b22');
          }
          tooltip.style.opacity = '0';
        });
    }

    // ─── Zoom: restore or fit-to-window ───
    if (!commitsChanged && hasInitialFitRef.current) {
      // Selection-only change → restore saved transform
      zoom.transform(d3svg, zoomTransformRef.current);
    } else {
      // Commits changed or first render → fit to window
      const totalW = totalContentWidth + 80;
      const scaleX = viewWidth / totalW;
      const scaleY = viewHeight / svgHeight;
      const scale = Math.min(scaleX, scaleY, 2);
      const contentW = totalW * scale;
      const contentH = svgHeight * scale;
      const tx = Math.max((viewWidth - contentW) / 2, 0);
      const ty = Math.max((viewHeight - contentH) / 2, 8);
      const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
      zoom.transform(d3svg, t);
      zoomTransformRef.current = t;
      hasInitialFitRef.current = true;
    }
  }, [nodes, selectedOid, onSelectCommit, commitFingerprint]);

  // Re-fit on container resize
  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const observer = new ResizeObserver(() => {
      const zoom = zoomBehaviorRef.current;
      if (!zoom) return;
      const d3svg = d3.select(svg);
      const viewWidth = container.clientWidth;
      const viewHeight = container.clientHeight || 600;
      d3svg.attr('width', viewWidth).attr('height', viewHeight)
        .attr('viewBox', `0 0 ${viewWidth} ${viewHeight}`);
      // Restore current transform (don't reset)
      zoom.transform(d3svg, zoomTransformRef.current);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  if (commits.length === 0) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#8b949e',
          fontSize: '0.875rem',
        }}
      >
        No commits to display
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {/* Tooltip overlay */}
      <div
        ref={tooltipRef}
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          opacity: 0,
          transition: 'opacity 0.15s',
          background: '#1c2128',
          border: '1px solid #30363d',
          borderRadius: 8,
          padding: '8px 12px',
          maxWidth: 400,
          zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          fontSize: '12px',
        }}
      />
    </div>
  );
}
