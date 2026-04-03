import { useEffect, useRef, useCallback } from 'react';
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
  const nodesRef = useRef<DagNode[]>([]);

  const renderGraph = useCallback(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    const nodes = buildDag(commits, branchMap);
    nodesRef.current = nodes;

    if (nodes.length === 0) return;

    const svgWidth = Math.max(calcGraphWidth(nodes), 200);
    const svgHeight = calcGraphHeight(nodes);
    const viewWidth = container.clientWidth;

    const d3svg = d3.select(svg);
    d3svg.selectAll('*').remove();

    // Width/height set after layout calculation via d3 (see bottom of render).

    // Zoom/pan group
    const g = d3svg.append('g').attr('class', 'zoom-group');

    // Setup zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', String(event.transform));
      });

    d3svg.call(zoom);

    // Build node lookup
    const nodeMap = new Map<string, DagNode>();
    for (const n of nodes) nodeMap.set(n.oid, n);

    // Draw edges
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

        // Cubic bezier for curved edges
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

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');

    const rightPanelWidth = 600; // room for labels
    const totalWidth = Math.max(svgWidth, 200) + rightPanelWidth;

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
        // Diamond shape for merge commits
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
        // Circle for regular commits
        nodeG
          .append('circle')
          .attr('cx', node.x)
          .attr('cy', node.y)
          .attr('r', NODE_RADIUS)
          .attr('fill', isSelected ? color : '#161b22')
          .attr('stroke', color)
          .attr('stroke-width', 2);
      }

      // Commit message label
      const labelX = svgWidth + 12;
      nodeG
        .append('text')
        .attr('x', labelX)
        .attr('y', node.y)
        .attr('dy', '0.32em')
        .attr('fill', isSelected ? '#dfe2eb' : '#c0c7d4')
        .attr('font-size', '12px')
        .attr('font-family', 'monospace')
        .text(node.abbreviatedOid)
        .attr('class', 'commit-sha');

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

      // Hover effect
      nodeG
        .on('mouseover', function () {
          d3.select(this)
            .selectAll('circle, polygon')
            .attr('fill', color);
        })
        .on('mouseout', function () {
          if (node.oid !== selectedOid) {
            d3.select(this)
              .selectAll('circle, polygon')
              .attr('fill', isSelected ? color : '#161b22');
          }
        });
    }

    // Use the container dimensions as the SVG coordinate space (no viewBox scaling).
    // The zoom transform alone handles fit-to-window.
    const viewHeight = container.clientHeight || 600;
    d3svg
      .attr('width', viewWidth)
      .attr('height', viewHeight)
      .attr('viewBox', `0 0 ${viewWidth} ${viewHeight}`);

    // Fit the full content (graph lanes + label panel) into the viewport
    const totalSvgWidth = totalWidth + 80;
    const scaleX = viewWidth / totalSvgWidth;
    const scaleY = viewHeight / svgHeight;
    const scale = Math.min(scaleX, scaleY, 2); // cap at 2× so it doesn't blow up for tiny graphs
    const contentW = totalSvgWidth * scale;
    const contentH = svgHeight * scale;
    const tx = Math.max((viewWidth - contentW) / 2, 0);
    const ty = Math.max((viewHeight - contentH) / 2, 8);
    zoom.transform(d3svg, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }, [commits, selectedOid, onSelectCommit, branchMap]);

  useEffect(() => {
    renderGraph();
  }, [renderGraph]);

  // Re-render on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => renderGraph());
    observer.observe(container);
    return () => observer.disconnect();
  }, [renderGraph]);

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
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
