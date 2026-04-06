import { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { buildNetworkLayout, getLaneColor } from '../lib/network-dag.js';
import type { NetworkNode } from '../lib/network-dag.js';
import type { CommitNode } from '../lib/api.js';

const NODE_RADIUS = 6;
const LANE_HEIGHT = 36;
const LANE_PADDING_TOP = 48;
const BRANCH_LABEL_WIDTH = 160;

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
  branchMap: Map<string, string[]>;
  defaultBranch?: string;
  selectedBranches: string[];
}

export default function NetworkGraphVisualization({
  commits,
  selectedOid,
  onSelectCommit,
  branchMap,
  defaultBranch,
  selectedBranches,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const branchLabelRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const hasInitialFitRef = useRef(false);

  const commitFingerprint = useMemo(
    () => commits.map((c) => c.oid).join(','),
    [commits]
  );
  const prevFingerprintRef = useRef('');

  const layout = useMemo(
    () => buildNetworkLayout(commits, branchMap, defaultBranch, selectedBranches),
    [commits, branchMap, defaultBranch, selectedBranches]
  );

  // Sync branch label vertical scroll with the zoom transform
  useEffect(() => {
    const labelDiv = branchLabelRef.current;
    if (!labelDiv) return;
    // Apply vertical translation from zoom
    const ty = zoomTransformRef.current.y;
    const scale = zoomTransformRef.current.k;
    labelDiv.style.transform = `translateY(${ty}px) scaleY(${scale})`;
    labelDiv.style.transformOrigin = 'top left';
  });

  useEffect(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    const labelDiv = branchLabelRef.current;
    if (!svg || !container || !tooltip || !labelDiv) return;
    if (layout.nodes.length === 0) return;

    const commitsChanged = commitFingerprint !== prevFingerprintRef.current;
    prevFingerprintRef.current = commitFingerprint;

    const viewWidth = container.clientWidth - BRANCH_LABEL_WIDTH;
    const viewHeight = container.clientHeight || 600;

    const d3svg = d3.select(svg);
    d3svg.selectAll('*').remove();

    d3svg
      .attr('width', viewWidth)
      .attr('height', viewHeight)
      .attr('viewBox', `0 0 ${viewWidth} ${viewHeight}`);

    const g = d3svg.append('g').attr('class', 'zoom-group');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        zoomTransformRef.current = event.transform;
        g.attr('transform', String(event.transform));
        // Sync branch labels vertical position
        if (labelDiv) {
          labelDiv.style.transform = `translateY(${event.transform.y}px) scaleY(${event.transform.k})`;
          labelDiv.style.transformOrigin = 'top left';
        }
      });

    zoomBehaviorRef.current = zoom;
    d3svg.call(zoom);

    // Draw branch lane backgrounds
    const lanesGroup = g.append('g').attr('class', 'lanes');
    for (let i = 0; i < layout.branches.length; i++) {
      const laneY = LANE_PADDING_TOP + i * LANE_HEIGHT;
      const color = getLaneColor(i);

      // Lane background stripe (alternating subtle)
      if (i % 2 === 1) {
        lanesGroup
          .append('rect')
          .attr('x', -10000)
          .attr('y', laneY)
          .attr('width', layout.totalWidth + 20000)
          .attr('height', LANE_HEIGHT)
          .attr('fill', 'rgba(255,255,255,0.02)');
      }

      // Lane line (thin horizontal)
      lanesGroup
        .append('line')
        .attr('x1', -10000)
        .attr('y1', laneY + LANE_HEIGHT / 2)
        .attr('x2', layout.totalWidth + 20000)
        .attr('y2', laneY + LANE_HEIGHT / 2)
        .attr('stroke', color)
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.2);
    }

    // Draw edges
    const edgeGroup = g.append('g').attr('class', 'edges');
    for (const edge of layout.edges) {
      const { x1, y1, x2, y2, color } = edge;

      let d: string;
      if (y1 === y2) {
        // Same lane — straight line
        d = `M ${x1} ${y1} L ${x2} ${y2}`;
      } else {
        // Cross-lane — curved connection
        const midX = (x1 + x2) / 2;
        d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
      }

      edgeGroup
        .append('path')
        .attr('d', d)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.5);
    }

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const nodeMap = new Map<string, NetworkNode>();
    for (const n of layout.nodes) nodeMap.set(n.oid, n);

    for (const node of layout.nodes) {
      const isSelected = node.oid === selectedOid;
      const color = getLaneColor(node.lane);

      const nodeG = nodeGroup
        .append('g')
        .attr('class', 'node')
        .attr('cursor', 'pointer')
        .on('click', () => onSelectCommit(node.oid));

      // Selected ring
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

      // Tooltip
      nodeG
        .on('mouseover', function (event: MouseEvent) {
          d3.select(this).selectAll('circle, polygon').attr('fill', color);

          const authorName = node.author?.name ?? 'Unknown';
          const authorLogin = node.author?.user?.login;
          const authorLine = authorLogin
            ? `${authorName} (@${authorLogin})`
            : authorName;
          const subject = node.message.split('\n')[0] ?? '';
          const commitBranches = branchMap?.get(node.oid);
          const branchesHtml =
            commitBranches && commitBranches.length > 0
              ? `<div style="font-size:11px;color:#8b949e;margin-top:3px;display:flex;flex-wrap:wrap;gap:4px">
                  ${commitBranches
                    .map(
                      (b) =>
                        `<span style="background:rgba(88,166,255,0.15);color:#58a6ff;border:1px solid rgba(88,166,255,0.3);border-radius:3px;padding:0 4px;font-family:monospace">${b}</span>`
                    )
                    .join('')}
                 </div>`
              : '';

          tooltip.innerHTML = `
            <div style="font-weight:600;color:#dfe2eb;margin-bottom:4px;word-break:break-all">${subject}</div>
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

    // Zoom: restore or fit
    if (!commitsChanged && hasInitialFitRef.current) {
      zoom.transform(d3svg, zoomTransformRef.current);
    } else {
      const scaleX = viewWidth / (layout.totalWidth + 60);
      const scaleY = viewHeight / (layout.totalHeight + 20);
      const scale = Math.min(scaleX, scaleY, 2);
      const contentW = layout.totalWidth * scale;
      const contentH = layout.totalHeight * scale;
      const tx = Math.max((viewWidth - contentW) / 2, 8);
      const ty = Math.max((viewHeight - contentH) / 2, 8);
      const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
      zoom.transform(d3svg, t);
      zoomTransformRef.current = t;
      hasInitialFitRef.current = true;
    }
  }, [layout, selectedOid, onSelectCommit, commitFingerprint, branchMap]);

  // Resize handler
  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    const observer = new ResizeObserver(() => {
      const zoom = zoomBehaviorRef.current;
      if (!zoom) return;
      const d3svg = d3.select(svg);
      const viewWidth = container.clientWidth - BRANCH_LABEL_WIDTH;
      const viewHeight = container.clientHeight || 600;
      d3svg
        .attr('width', viewWidth)
        .attr('height', viewHeight)
        .attr('viewBox', `0 0 ${viewWidth} ${viewHeight}`);
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
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
      }}
    >
      {/* Fixed branch labels column */}
      <div
        style={{
          width: BRANCH_LABEL_WIDTH,
          flexShrink: 0,
          background: '#0d1117',
          borderRight: '1px solid #21262d',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 5,
        }}
      >
        <div
          ref={branchLabelRef}
          style={{
            transformOrigin: 'top left',
          }}
        >
          {layout.branches.map((name, i) => {
            const color = getLaneColor(i);
            const laneY = LANE_PADDING_TOP + i * LANE_HEIGHT;
            return (
              <div
                key={name}
                style={{
                  position: 'absolute',
                  top: laneY,
                  left: 0,
                  right: 0,
                  height: LANE_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  gap: '6px',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    color: '#c0c7d4',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={name}
                >
                  {name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* SVG graph area */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <svg
          ref={svgRef}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>

      {/* Tooltip */}
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
