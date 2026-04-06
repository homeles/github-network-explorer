// Network DAG layout: horizontal timeline with branch lanes
// Each branch gets its own Y-row, commits placed on X-axis by timestamp

import type { CommitNode } from './api.js';

export interface NetworkNode {
  oid: string;
  abbreviatedOid: string;
  message: string;
  committedDate: string;
  author: CommitNode['author'];
  parents: { nodes: { oid: string }[] };
  additions: number;
  deletions: number;
  isMerge: boolean;
  // Layout
  x: number;
  y: number;
  branch: string; // primary branch this node is drawn on
  lane: number;   // row index (branch index)
}

export interface NetworkEdge {
  sourceOid: string;
  targetOid: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface NetworkLayout {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  branches: string[];
  totalWidth: number;
  totalHeight: number;
}

const LANE_HEIGHT = 36;
const LANE_PADDING_TOP = 48; // space for time axis
const BRANCH_LABEL_WIDTH = 0; // labels drawn separately
const MIN_X_GAP = 32;
const NODE_PADDING_LEFT = 24;
const NODE_PADDING_RIGHT = 40;

const LANE_COLORS = [
  '#58a6ff', // blue
  '#3fb950', // green
  '#bc8cff', // purple
  '#d29922', // yellow
  '#f85149', // red
  '#39d353', // light green
  '#ff7b72', // salmon
  '#79c0ff', // light blue
];

export function getLaneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? '#58a6ff';
}

/**
 * Build a horizontal network layout from commits + branchMap.
 *
 * Strategy:
 * 1. Order branches: default branch first, then alphabetical
 * 2. Assign each commit to a "primary" branch (the first branch in sorted order)
 * 3. Place commits on X-axis by timestamp (oldest=left, newest=right)
 * 4. Place commits on Y-axis by branch lane
 * 5. Build edges from parent→child across (or within) lanes
 */
export function buildNetworkLayout(
  commits: CommitNode[],
  branchMap: Map<string, string[]>,
  defaultBranch?: string,
  selectedBranches?: string[]
): NetworkLayout {
  if (commits.length === 0) {
    return { nodes: [], edges: [], branches: [], totalWidth: 0, totalHeight: 0 };
  }

  // 1. Determine branch order
  const branchSet = new Set<string>();
  for (const branches of branchMap.values()) {
    for (const b of branches) branchSet.add(b);
  }

  // Filter to selected branches if provided
  const visibleBranches = selectedBranches && selectedBranches.length > 0
    ? [...branchSet].filter((b) => selectedBranches.includes(b))
    : [...branchSet];

  // Sort: default branch first, then alphabetical
  visibleBranches.sort((a, b) => {
    if (a === defaultBranch) return -1;
    if (b === defaultBranch) return 1;
    return a.localeCompare(b);
  });

  const branchIndex = new Map<string, number>();
  visibleBranches.forEach((name, i) => branchIndex.set(name, i));

  // 2. Assign each commit to a primary branch
  // Primary = the visible branch with lowest index (most important first)
  const commitPrimaryBranch = new Map<string, string>();
  for (const commit of commits) {
    const branches = branchMap.get(commit.oid) ?? [];
    let primary: string | null = null;
    let bestIdx = Infinity;
    for (const b of branches) {
      const idx = branchIndex.get(b);
      if (idx !== undefined && idx < bestIdx) {
        bestIdx = idx;
        primary = b;
      }
    }
    if (primary) {
      commitPrimaryBranch.set(commit.oid, primary);
    }
  }

  // 3. Filter commits that belong to at least one visible branch
  const visibleCommits = commits.filter((c) => commitPrimaryBranch.has(c.oid));

  if (visibleCommits.length === 0) {
    return { nodes: [], edges: [], branches: visibleBranches, totalWidth: 0, totalHeight: 0 };
  }

  // 4. Sort by timestamp (oldest first for left-to-right)
  const sorted = [...visibleCommits].sort(
    (a, b) => new Date(a.committedDate).getTime() - new Date(b.committedDate).getTime()
  );

  // 5. Assign X positions — evenly spaced to avoid overlap
  //    Group commits by their primary branch, and within each branch lane,
  //    order by timestamp. Use global timestamp order for x position.
  const xPositions = new Map<string, number>();
  sorted.forEach((c, i) => {
    xPositions.set(c.oid, NODE_PADDING_LEFT + i * MIN_X_GAP);
  });

  const totalWidth = NODE_PADDING_LEFT + (sorted.length - 1) * MIN_X_GAP + NODE_PADDING_RIGHT;
  const totalHeight = LANE_PADDING_TOP + visibleBranches.length * LANE_HEIGHT + 16;

  // 6. Build nodes
  const nodes: NetworkNode[] = sorted.map((commit) => {
    const primary = commitPrimaryBranch.get(commit.oid)!;
    const lane = branchIndex.get(primary) ?? 0;
    return {
      oid: commit.oid,
      abbreviatedOid: commit.abbreviatedOid,
      message: commit.message,
      committedDate: commit.committedDate,
      author: commit.author,
      parents: commit.parents,
      additions: commit.additions,
      deletions: commit.deletions,
      isMerge: commit.parents.nodes.length > 1,
      x: xPositions.get(commit.oid)!,
      y: LANE_PADDING_TOP + lane * LANE_HEIGHT + LANE_HEIGHT / 2,
      branch: primary,
      lane,
    };
  });

  const nodeMap = new Map<string, NetworkNode>();
  for (const n of nodes) nodeMap.set(n.oid, n);

  // 7. Build edges
  const edges: NetworkEdge[] = [];
  for (const node of nodes) {
    for (const parentRef of node.parents.nodes) {
      const parent = nodeMap.get(parentRef.oid);
      if (!parent) continue;

      edges.push({
        sourceOid: node.oid,
        targetOid: parent.oid,
        x1: node.x,
        y1: node.y,
        x2: parent.x,
        y2: parent.y,
        color: getLaneColor(node.lane),
      });
    }
  }

  return {
    nodes,
    edges,
    branches: visibleBranches,
    totalWidth,
    totalHeight,
  };
}
