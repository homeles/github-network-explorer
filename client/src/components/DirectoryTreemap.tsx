import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { DirectoryStats } from '../lib/api.js';

interface Props {
  data: DirectoryStats[];
  onPathSelect: (path: string) => void;
  currentPath: string;
  owner: string;
  repo: string;
}

interface TreeNode {
  name: string;
  path: string;
  value: number;
  additions: number;
  deletions: number;
  children?: TreeNode[];
}

function buildTree(nodes: DirectoryStats[], currentPath: string): TreeNode {
  // Filter to only show children of the currentPath
  const relevant = currentPath
    ? nodes.filter((n) => n.path.startsWith(currentPath) || n.path === currentPath)
    : nodes;

  function statsToNode(s: DirectoryStats): TreeNode {
    const name = s.path.replace(/\/$/, '').split('/').pop() ?? s.path;
    if (s.children.length > 0) {
      return {
        name,
        path: s.path,
        value: s.changes,
        additions: s.additions,
        deletions: s.deletions,
        children: s.children.map(statsToNode),
      };
    }
    return {
      name,
      path: s.path,
      value: s.changes || 1,
      additions: s.additions,
      deletions: s.deletions,
    };
  }

  return {
    name: currentPath || 'root',
    path: currentPath,
    value: 0,
    additions: 0,
    deletions: 0,
    children: relevant.map(statsToNode),
  };
}

export default function DirectoryTreemap({ data, onPathSelect, currentPath, owner, repo }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = 500;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const treeData = buildTree(data, currentPath);

    const root = d3
      .hierarchy<TreeNode>(treeData)
      .sum((d) => d.value)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.treemap<TreeNode>()
      .size([width, height])
      .paddingOuter(4)
      .paddingTop(20)
      .paddingInner(2)
      .round(true)(root);

    // Color scale: ratio of additions to total determines color
    // pure additions (#238636), balanced (#8b949e), pure deletions (#da3633)
    function getColor(node: TreeNode): string {
      const total = node.additions + node.deletions;
      if (total === 0) return '#30363d';
      const ratio = node.additions / total; // 0=all deletions, 1=all additions
      if (ratio > 0.6) return '#238636';
      if (ratio < 0.4) return '#da3633';
      return '#8b949e';
    }

    const cell = svg
      .selectAll<SVGGElement, d3.HierarchyRectangularNode<TreeNode>>('g')
      .data(root.leaves())
      .join('g')
      .attr('transform', (d) => `translate(${(d as d3.HierarchyRectangularNode<TreeNode>).x0},${(d as d3.HierarchyRectangularNode<TreeNode>).y0})`);

    cell
      .append('rect')
      .attr('width', (d) => Math.max(0, (d as d3.HierarchyRectangularNode<TreeNode>).x1 - (d as d3.HierarchyRectangularNode<TreeNode>).x0))
      .attr('height', (d) => Math.max(0, (d as d3.HierarchyRectangularNode<TreeNode>).y1 - (d as d3.HierarchyRectangularNode<TreeNode>).y0))
      .attr('fill', (d) => getColor(d.data))
      .attr('fill-opacity', 0.7)
      .attr('stroke', '#0d1117')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        // If it's a directory, drill in; if file, select parent
        const path = d.data.path;
        if (path.endsWith('/')) {
          onPathSelect(path);
        } else {
          const parent = path.includes('/') ? path.substring(0, path.lastIndexOf('/') + 1) : '';
          onPathSelect(parent);
        }
      })
      .on('contextmenu', (event: MouseEvent, d) => {
        event.preventDefault();
        const ghType = d.data.path.endsWith('/') ? 'tree' : 'blob';
        window.open(`https://github.com/${owner}/${repo}/${ghType}/HEAD/${d.data.path}`, '_blank');
      })
      .on('mouseover', function () {
        d3.select(this).attr('fill-opacity', 1);
      })
      .on('mouseout', function () {
        d3.select(this).attr('fill-opacity', 0.7);
      });

    cell
      .filter((d) => {
        const w = (d as d3.HierarchyRectangularNode<TreeNode>).x1 - (d as d3.HierarchyRectangularNode<TreeNode>).x0;
        const h = (d as d3.HierarchyRectangularNode<TreeNode>).y1 - (d as d3.HierarchyRectangularNode<TreeNode>).y0;
        return w > 40 && h > 20;
      })
      .append('text')
      .attr('x', 4)
      .attr('y', 14)
      .attr('fill', '#dfe2eb')
      .attr('font-size', '0.75rem')
      .attr('pointer-events', 'none')
      .text((d) => {
        const w = (d as d3.HierarchyRectangularNode<TreeNode>).x1 - (d as d3.HierarchyRectangularNode<TreeNode>).x0;
        const name = d.data.name;
        if (w < 80) return name.slice(0, Math.floor(w / 8));
        return name;
      });

    cell
      .filter((d) => {
        const w = (d as d3.HierarchyRectangularNode<TreeNode>).x1 - (d as d3.HierarchyRectangularNode<TreeNode>).x0;
        const h = (d as d3.HierarchyRectangularNode<TreeNode>).y1 - (d as d3.HierarchyRectangularNode<TreeNode>).y0;
        return w > 40 && h > 32;
      })
      .append('text')
      .attr('x', 4)
      .attr('y', 28)
      .attr('fill', '#8b949e')
      .attr('font-size', '0.6875rem')
      .attr('pointer-events', 'none')
      .text((d) => `±${d.data.value.toLocaleString()}`);

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

    cell
      .on('mousemove', (event: MouseEvent, d) => {
        tooltip
          .style('opacity', '1')
          .style('left', `${event.offsetX + 12}px`)
          .style('top', `${event.offsetY - 8}px`)
          .html(
            `<div style="font-weight:600;margin-bottom:4px;font-family:monospace">${d.data.path}</div>` +
            `<div style="color:#3fb950">+${d.data.additions.toLocaleString()}</div>` +
            `<div style="color:#f85149">-${d.data.deletions.toLocaleString()}</div>` +
            `<div style="color:#8b949e">±${d.data.value.toLocaleString()} total changes</div>` +
            `<div style="margin-top:4px;color:#6e7681;font-size:0.6875rem">Click to drill down · Right-click to open on GitHub</div>`
          );
      })
      .on('mouseleave', () => tooltip.style('opacity', '0'));

    return () => {
      tooltip.remove();
    };
  }, [data, currentPath, onPathSelect]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg ref={svgRef} style={{ display: 'block' }} />
      {data.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#8b949e' }}>
          No directory data available
        </div>
      )}
    </div>
  );
}
