// Network DAG layout: horizontal timeline with branch lanes
// Each branch gets its own Y-row, commits placed on X-axis by timestamp
// GitHub-style: every branch shows ALL its commits, with connections at fork/merge points

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
  branch: string; // branch this node is drawn on
  lane: number;   // row index (branch index)
  /** Unique key for this node instance (oid may repeat across lanes) */
  nodeKey: string;
}

export interface NetworkEdge {
  sourceKey: string;
  targetKey: string;
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
const LANE_PADDING_TOP = 48;
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
 * Strategy (GitHub-style):
 * 1. For each branch, collect ALL commits that belong to it (from branchMap)
 * 2. Each branch gets its own lane — commits are placed along that lane
 * 3. Each commit appears on EVERY branch that contains it
 *    (but we de-emphasize shared commits on non-primary branches)
 * 4. Edges connect parent→child within the same lane
 * 5. Cross-lane edges connect fork/merge points between branches
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

  // Build commit lookup
  const commitByOid = new Map<string, CommitNode>();
  for (const c of commits) commitByOid.set(c.oid, c);

  // 1. Determine which branches exist and are visible
  const branchSet = new Set<string>();
  for (const branches of branchMap.values()) {
    for (const b of branches) branchSet.add(b);
  }

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

  // 2. For each branch, collect its commits (from branchMap) sorted by time
  const branchCommits = new Map<string, CommitNode[]>();
  for (const branch of visibleBranches) {
    branchCommits.set(branch, []);
  }

  for (const commit of commits) {
    const branches = branchMap.get(commit.oid) ?? [];
    for (const b of branches) {
      if (branchIndex.has(b)) {
        branchCommits.get(b)!.push(commit);
      }
    }
  }

  // Sort each branch's commits oldest-first
  for (const [, arr] of branchCommits) {
    arr.sort(
      (a, b) => new Date(a.committedDate).getTime() - new Date(b.committedDate).getTime()
    );
  }

  // 3. Determine "primary branch" for each commit (for edge coloring & emphasis)
  //    Primary = the branch with the highest index where this commit is the
  //    most "specific" to that branch. If a commit exists on main + feature,
  //    and it's NOT the tip area of the feature, it's primary=main.
  //    Simple heuristic: primary = branch with lowest index that contains it.
  const commitPrimary = new Map<string, string>();
  for (const commit of commits) {
    const branches = branchMap.get(commit.oid) ?? [];
    let best: string | null = null;
    let bestIdx = Infinity;
    for (const b of branches) {
      const idx = branchIndex.get(b);
      if (idx !== undefined && idx < bestIdx) {
        bestIdx = idx;
        best = b;
      }
    }
    if (best) commitPrimary.set(commit.oid, best);
  }

  // 4. Build global X positions based on timestamp order
  //    All unique commits sorted by time, each gets an x slot
  const allSorted = [...commits].sort(
    (a, b) => new Date(a.committedDate).getTime() - new Date(b.committedDate).getTime()
  );
  const xPositions = new Map<string, number>();
  allSorted.forEach((c, i) => {
    if (!xPositions.has(c.oid)) {
      xPositions.set(c.oid, NODE_PADDING_LEFT + i * MIN_X_GAP);
    }
  });

  const maxX = allSorted.length > 0
    ? NODE_PADDING_LEFT + (allSorted.length - 1) * MIN_X_GAP
    : NODE_PADDING_LEFT;
  const totalWidth = maxX + NODE_PADDING_RIGHT;
  const totalHeight = LANE_PADDING_TOP + visibleBranches.length * LANE_HEIGHT + 16;

  // 5. Build nodes — one per (commit, branch) pair
  //    Only show a commit on a branch if the commit belongs to that branch
  const nodes: NetworkNode[] = [];
  const nodeByKey = new Map<string, NetworkNode>(); // key = "oid:branch"

  for (const branch of visibleBranches) {
    const lane = branchIndex.get(branch)!;
    const bCommits = branchCommits.get(branch) ?? [];

    for (const commit of bCommits) {
      const key = `${commit.oid}:${branch}`;
      const node: NetworkNode = {
        oid: commit.oid,
        abbreviatedOid: commit.abbreviatedOid,
        message: commit.message,
        committedDate: commit.committedDate,
        author: commit.author,
        parents: commit.parents,
        additions: commit.additions,
        deletions: commit.deletions,
        isMerge: commit.parents.nodes.length > 1,
        x: xPositions.get(commit.oid) ?? 0,
        y: LANE_PADDING_TOP + lane * LANE_HEIGHT + LANE_HEIGHT / 2,
        branch,
        lane,
        nodeKey: key,
      };
      nodes.push(node);
      nodeByKey.set(key, node);
    }
  }

  // 6. Build edges
  //    For each node, connect to its parent(s):
  //    - If parent exists on same branch → same-lane edge
  //    - If parent exists on different branch → cross-lane edge (fork/merge)
  const edges: NetworkEdge[] = [];
  const edgeSet = new Set<string>(); // deduplicate

  for (const node of nodes) {
    const branch = node.branch;
    const lane = node.lane;

    for (const parentRef of node.parents.nodes) {
      const parentOid = parentRef.oid;

      // Try same-branch connection first
      const sameBranchKey = `${parentOid}:${branch}`;
      const parentSameBranch = nodeByKey.get(sameBranchKey);

      if (parentSameBranch) {
        const edgeKey = `${node.nodeKey}->${sameBranchKey}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            sourceKey: node.nodeKey,
            targetKey: sameBranchKey,
            x1: node.x,
            y1: node.y,
            x2: parentSameBranch.x,
            y2: parentSameBranch.y,
            color: getLaneColor(lane),
          });
        }
      } else {
        // Parent not on this branch — find it on another branch (cross-lane)
        // Pick the primary branch for the parent
        const parentPrimary = commitPrimary.get(parentOid);
        if (parentPrimary) {
          const crossKey = `${parentOid}:${parentPrimary}`;
          const parentNode = nodeByKey.get(crossKey);
          if (parentNode) {
            const edgeKey = `${node.nodeKey}->${crossKey}`;
            if (!edgeSet.has(edgeKey)) {
              edgeSet.add(edgeKey);
              edges.push({
                sourceKey: node.nodeKey,
                targetKey: crossKey,
                x1: node.x,
                y1: node.y,
                x2: parentNode.x,
                y2: parentNode.y,
                color: getLaneColor(lane),
              });
            }
          }
        }
      }
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
