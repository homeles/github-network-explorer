import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { DirectoryStats } from '../lib/github-api.js';

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
  isDir: boolean;
  children?: TreeNode[];
}

function findNodeByPath(
  nodes: DirectoryStats[],
  targetPath: string
): DirectoryStats | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (targetPath.startsWith(node.path)) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function buildTree(nodes: DirectoryStats[], currentPath: string): TreeNode {
  function statsToNode(s: DirectoryStats): TreeNode {
    const name = s.path.replace(/\/$/, '').split('/').pop() ?? s.path;
    const isDir = s.children.length > 0 || s.path.endsWith('/');
    if (s.children.length > 0) {
      return {
        name,
        path: s.path,
        value: s.changes || 1,
        additions: s.additions,
        deletions: s.deletions,
        isDir: true,
        children: s.children.map(statsToNode),
      };
    }
    return {
      name,
      path: s.path,
      value: s.changes || 1,
      additions: s.additions,
      deletions: s.deletions,
      isDir,
    };
  }

  if (currentPath) {
    const target = findNodeByPath(nodes, currentPath);
    if (target && target.children.length > 0) {
      return {
        name: currentPath,
        path: currentPath,
        value: 0,
        additions: 0,
        deletions: 0,
        isDir: true,
        children: target.children.map(statsToNode),
      };
    }
    if (target) {
      return {
        name: currentPath,
        path: currentPath,
        value: 0,
        additions: 0,
        deletions: 0,
        isDir: true,
        children: [statsToNode(target)],
      };
    }
  }

  return {
    name: 'root',
    path: '',
    value: 0,
    additions: 0,
    deletions: 0,
    isDir: true,
    children: nodes.map(statsToNode),
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
    const HEADER_HEIGHT = 22;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const treeData = buildTree(data, currentPath);

    const root = d3
      .hierarchy<TreeNode>(treeData)
      .sum((d) => (d.children ? 0 : d.value))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.treemap<TreeNode>()
      .size([width, height])
      .paddingOuter(3)
      .paddingTop(HEADER_HEIGHT + 2)
      .paddingInner(2)
      .paddingBottom(2)
      .round(true)(root);

    type RectNode = d3.HierarchyRectangularNode<TreeNode>;

    function getColor(node: TreeNode): string {
      const total = node.additions + node.deletions;
      if (total === 0) return '#30363d';
      const ratio = node.additions / total;
      if (ratio > 0.65) return '#238636';
      if (ratio > 0.5) return '#2ea043';
      if (ratio < 0.35) return '#da3633';
      if (ratio < 0.5) return '#bd561d';
      return '#8b949e';
    }

    // Tooltip (created early so dirG and leafG can both reference it)
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
      .style('z-index', '10')
      .style('max-width', '400px');

    // Render directory group headers (non-leaf nodes with depth 1+)
    const dirGroups = root.descendants().filter((d) => d.children && d.depth >= 1);

    const dirG = svg
      .selectAll<SVGGElement, RectNode>('g.dir')
      .data(dirGroups as RectNode[])
      .join('g')
      .attr('class', 'dir')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

    // Directory background
    dirG
      .append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('fill', '#161b22')
      .attr('stroke', '#30363d')
      .attr('stroke-width', 1)
      .attr('rx', 4)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        onPathSelect(d.data.path);
      })
      .on('contextmenu', (event: MouseEvent, d) => {
        event.preventDefault();
        window.open(`https://github.com/${owner}/${repo}/tree/HEAD/${d.data.path}`, '_blank');
      })
      .on('mouseover', function () {
        d3.select(this).attr('stroke', '#58a6ff').attr('stroke-width', 1);
      })
      .on('mouseout', function () {
        d3.select(this).attr('stroke', '#30363d').attr('stroke-width', 1);
      });

    // Directory header bar
    dirG
      .append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', HEADER_HEIGHT)
      .attr('fill', '#21262d')
      .attr('rx', 4)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        onPathSelect(d.data.path);
      })
      .on('mouseover', function () {
        const parentG = d3.select(this.parentNode as SVGGElement);
        parentG.select('rect').attr('stroke', '#58a6ff').attr('stroke-width', 1);
      })
      .on('mouseout', function () {
        const parentG = d3.select(this.parentNode as SVGGElement);
        parentG.select('rect').attr('stroke', '#30363d').attr('stroke-width', 1);
      });

    // Square bottom corners of header (overlap with body)
    dirG
      .append('rect')
      .attr('y', HEADER_HEIGHT - 4)
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', 4)
      .attr('fill', '#21262d');

    // Directory folder icon + name
    dirG
      .filter((d) => (d.x1 - d.x0) > 30)
      .append('text')
      .attr('x', 6)
      .attr('y', HEADER_HEIGHT - 6)
      .attr('fill', '#dfe2eb')
      .attr('font-size', '0.6875rem')
      .attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text((d) => {
        const w = d.x1 - d.x0;
        const name = '📁 ' + d.data.name;
        const maxChars = Math.floor((w - 12) / 7);
        return name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name;
      });

    // Directory tooltip on hover
    dirG
      .on('mousemove', (event: MouseEvent, d) => {
        tooltip
          .style('opacity', '1')
          .style('left', `${Math.min(event.offsetX + 12, width - 300)}px`)
          .style('top', `${event.offsetY - 8}px`)
          .html(
            `<div style="font-weight:600;margin-bottom:4px;font-family:monospace;word-break:break-all">📁 ${d.data.path}</div>` +
            `<div style="color:#3fb950">+${d.data.additions.toLocaleString()}</div>` +
            `<div style="color:#f85149">-${d.data.deletions.toLocaleString()}</div>` +
            `<div style="color:#8b949e">±${(d.value ?? 0).toLocaleString()} total changes</div>` +
            `<div style="margin-top:4px;color:#6e7681;font-size:0.6875rem">Click to drill down · Right-click → GitHub</div>`
          );
      })
      .on('mouseleave', () => tooltip.style('opacity', '0'));

    // Directory change count in header (right-aligned)
    dirG
      .filter((d) => (d.x1 - d.x0) > 100)
      .append('text')
      .attr('x', (d) => d.x1 - d.x0 - 6)
      .attr('y', HEADER_HEIGHT - 6)
      .attr('text-anchor', 'end')
      .attr('fill', '#8b949e')
      .attr('font-size', '0.625rem')
      .attr('pointer-events', 'none')
      .text((d) => `±${(d.value ?? 0).toLocaleString()}`);

    // Render leaf nodes (files)
    const leaves = root.leaves();

    const leafG = svg
      .selectAll<SVGGElement, RectNode>('g.leaf')
      .data(leaves as RectNode[])
      .join('g')
      .attr('class', 'leaf')
      .attr('transform', (d) => `translate(${d.x0},${d.y0})`);

    leafG
      .append('rect')
      .attr('width', (d) => Math.max(0, d.x1 - d.x0))
      .attr('height', (d) => Math.max(0, d.y1 - d.y0))
      .attr('fill', (d) => getColor(d.data))
      .attr('fill-opacity', 0.75)
      .attr('rx', 2)
      .style('cursor', 'pointer')
      .on('click', (_event, d) => {
        const path = d.data.path;
        if (d.data.isDir) {
          onPathSelect(path);
        } else {
          const parent = path.includes('/') ? path.substring(0, path.lastIndexOf('/') + 1) : '';
          onPathSelect(parent);
        }
      })
      .on('contextmenu', (event: MouseEvent, d) => {
        event.preventDefault();
        const ghType = d.data.isDir ? 'tree' : 'blob';
        window.open(`https://github.com/${owner}/${repo}/${ghType}/HEAD/${d.data.path}`, '_blank');
      })
      .on('mouseover', function () {
        d3.select(this).attr('fill-opacity', 1).attr('stroke', '#58a6ff').attr('stroke-width', 1);
      })
      .on('mouseout', function () {
        d3.select(this).attr('fill-opacity', 0.75).attr('stroke', 'none');
      });

    // File name labels
    leafG
      .filter((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        return w > 40 && h > 18;
      })
      .append('text')
      .attr('x', 3)
      .attr('y', 13)
      .attr('fill', '#dfe2eb')
      .attr('font-size', '0.6875rem')
      .attr('pointer-events', 'none')
      .text((d) => {
        const w = d.x1 - d.x0;
        const name = d.data.name;
        const maxChars = Math.floor((w - 6) / 7);
        return name.length > maxChars ? name.slice(0, maxChars - 1) + '…' : name;
      });

    // Change count label on files
    leafG
      .filter((d) => {
        const w = d.x1 - d.x0;
        const h = d.y1 - d.y0;
        return w > 40 && h > 30;
      })
      .append('text')
      .attr('x', 3)
      .attr('y', 25)
      .attr('fill', '#8b949e')
      .attr('font-size', '0.625rem')
      .attr('pointer-events', 'none')
      .text((d) => `±${d.data.value.toLocaleString()}`);

    leafG
      .on('mousemove', (event: MouseEvent, d) => {
        const icon = d.data.isDir ? '📁' : '📄';
        tooltip
          .style('opacity', '1')
          .style('left', `${Math.min(event.offsetX + 12, width - 300)}px`)
          .style('top', `${event.offsetY - 8}px`)
          .html(
            `<div style="font-weight:600;margin-bottom:4px;font-family:monospace;word-break:break-all">${icon} ${d.data.path}</div>` +
            `<div style="color:#3fb950">+${d.data.additions.toLocaleString()}</div>` +
            `<div style="color:#f85149">-${d.data.deletions.toLocaleString()}</div>` +
            `<div style="color:#8b949e">±${d.data.value.toLocaleString()} total changes</div>` +
            `<div style="margin-top:4px;color:#6e7681;font-size:0.6875rem">Click to drill down · Right-click → GitHub</div>`
          );
      })
      .on('mouseleave', () => tooltip.style('opacity', '0'));

    return () => {
      tooltip.remove();
    };
  }, [data, currentPath, onPathSelect, owner, repo]);

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
