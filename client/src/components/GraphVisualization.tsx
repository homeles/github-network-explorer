import { useEffect, useRef, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { buildDag, calcGraphWidth, calcGraphHeight, GRAPH_CONSTANTS } from '../lib/dag.js';
import type { DagNode } from '../lib/dag.js';
import type { CommitNode } from '../lib/api.js';

const { NODE_RADIUS } = GRAPH_CONSTANTS;

// Layout: commit details on LEFT, graph dots on RIGHT
const LABEL_LEFT_PAD = 16;     // left padding for text labels
const SHA_WIDTH = 64;          // width for abbreviated SHA
const MSG_WIDTH = 460;         // width for commit message
const DATE_WIDTH = 80;         // width for relative date
const LABEL_AREA_WIDTH = LABEL_LEFT_PAD + SHA_WIDTH + MSG_WIDTH + DATE_WIDTH + 24;

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
  branchMap?: Map<string, string[]>;
  defaultBranch?: string;
}

export default function GraphVisualization({
  commits,
  selectedOid,
  onSelectCommit,
  branchMap,
  defaultBranch,
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
  const nodes = useMemo(
    () => buildDag(commits, branchMap, defaultBranch),
    [commits, branchMap, defaultBranch]
  );

  // Re-center: zoom to latest commit (row 0), positioned at top of viewport
  const recenter = useCallback(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    const zoom = zoomBehaviorRef.current;
    if (!svg || !container || !zoom || nodes.length === 0) return;

    const viewWidth = container.clientWidth;

    // Latest commit is row 0
    const latestNode = nodes[0]!;
    const latestY = latestNode.y;

    // The content starts at x=0 (label left pad) and the graph dots are offset
    // by LABEL_AREA_WIDTH. We want the full row visible, so anchor x=0 at
    // a small left margin.
    const graphWidth = Math.max(calcGraphWidth(nodes), 60);
    const totalContentWidth = LABEL_AREA_WIDTH + graphWidth + 40;

    // Pick scale so the full content width fits the viewport (but cap at 1)
    const scale = Math.min(viewWidth / totalContentWidth, 1);

    // Horizontally: center the content if it's narrower than the viewport
    const contentW = totalContentWidth * scale;
    const tx = Math.max((viewWidth - contentW) / 2, 8);

    // Vertically: place the latest commit 40px from the top of the viewport
    const ty = 40 - latestY * scale;

    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);

    const d3svg = d3.select(svg);
    d3svg.transition().duration(400).call(zoom.transform, t);
    zoomTransformRef.current = t;
  }, [nodes]);

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

    // Graph dots are on the RIGHT side, offset by LABEL_AREA_WIDTH
    // Remap node x positions: original x is lane-based, shift right by label area
    const graphOffsetX = LABEL_AREA_WIDTH;

    // ─── Draw edges ───
    const edgeGroup = g.append('g').attr('class', 'edges');

    for (const node of nodes) {
      for (const parentRef of node.parents.nodes) {
        const parent = nodeMap.get(parentRef.oid);
        if (!parent) continue;

        const x1 = graphOffsetX + node.x;
        const y1 = node.y;
        const x2 = graphOffsetX + parent.x;
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

    const totalContentWidth = LABEL_AREA_WIDTH + graphWidth + 40;

    for (const node of nodes) {
      const isSelected = node.oid === selectedOid;
      const color = getLaneColor(node.lane);
      const dotX = graphOffsetX + node.x;
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
          .attr('cx', dotX)
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
            `${dotX},${node.y - size} ${dotX + size},${node.y} ${dotX},${node.y + size} ${dotX - size},${node.y}`
          )
          .attr('fill', isSelected ? color : '#161b22')
          .attr('stroke', color)
          .attr('stroke-width', 2);
      } else {
        nodeG
          .append('circle')
          .attr('cx', dotX)
          .attr('cy', node.y)
          .attr('r', NODE_RADIUS)
          .attr('fill', isSelected ? color : '#161b22')
          .attr('stroke', color)
          .attr('stroke-width', 2);
      }

      // ─── LEFT SIDE: commit details (SHA, message, date) ───
      // SHA label
      nodeG
        .append('text')
        .attr('x', LABEL_LEFT_PAD)
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
        .attr('x', LABEL_LEFT_PAD + SHA_WIDTH)
        .attr('y', node.y)
        .attr('dy', '0.32em')
        .attr('fill', isSelected ? '#dfe2eb' : '#c0c7d4')
        .attr('font-size', '12px')
        .text(truncated);

      // Date
      nodeG
        .append('text')
        .attr('x', LABEL_LEFT_PAD + SHA_WIDTH + MSG_WIDTH)
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
          const commitBranches = branchMap?.get(node.oid);
          const branchesHtml = commitBranches && commitBranches.length > 0
            ? `<div style="font-size:11px;color:#8b949e;margin-top:3px;display:flex;flex-wrap:wrap;gap:4px">
                ${commitBranches.map((b) => `<span style="background:rgba(88,166,255,0.15);color:#58a6ff;border:1px solid rgba(88,166,255,0.3);border-radius:3px;padding:0 4px;font-family:monospace">${b}</span>`).join('')}
               </div>`
            : '';

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
            ${branchesHtml}
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
      {/* Re-center button */}
      <button
        onClick={recenter}
        title="Re-center to latest commit"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#21262d',
          border: '1px solid #30363d',
          borderRadius: 8,
          color: '#c0c7d4',
          cursor: 'pointer',
          zIndex: 20,
          transition: 'background 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#30363d';
          e.currentTarget.style.borderColor = '#58a6ff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#21262d';
          e.currentTarget.style.borderColor = '#30363d';
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </button>
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
