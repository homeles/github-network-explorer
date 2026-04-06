// Network DAG layout: GitHub-style horizontal timeline
// KEY PRINCIPLE: Each commit appears EXACTLY ONCE.
// Lane assignment is based on parent topology, not branch membership.
// Edges follow parent references — cross-lane edges ARE the fork/merge lines.

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
  x: number;
  y: number;
  lane: number;
  time: number;  // x-axis index
}

export interface NetworkEdge {
  sourceOid: string;
  targetOid: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  sourceLane: number;
  targetLane: number;
}

export interface NetworkLayout {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  laneLabels: { lane: number; label: string; isLive: boolean }[];
  totalWidth: number;
  totalHeight: number;
}

const LANE_HEIGHT = 40;
const LANE_PADDING_TOP = 32;
const X_GAP = 28;
const X_PADDING_LEFT = 20;
const X_PADDING_RIGHT = 40;

const LANE_COLORS = [
  '#58a6ff', '#3fb950', '#bc8cff', '#d29922',
  '#f85149', '#39d353', '#ff7b72', '#79c0ff',
  '#ffa657', '#d2a8ff', '#7ee787', '#a5d6ff',
];

export function getLaneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? '#58a6ff';
}

/**
 * GitHub-style network layout algorithm.
 *
 * 1. Sort all commits by timestamp (oldest first) — this is the X-axis order.
 * 2. Assign each commit exactly ONE lane (Y-axis position).
 * 3. Lane assignment follows the rule:
 *    - A commit inherits its first parent's lane (continuing the same line).
 *    - If a commit has no first parent in view, or is a branch head, it gets a new lane.
 *    - For merge commits, the first parent keeps the lane, second parent is on a different lane.
 *    - When a lane is "done" (no more children reference it), it can be recycled.
 * 4. Edges connect each commit to its parents, crossing lanes as needed.
 */
export function buildNetworkLayout(
  commits: CommitNode[],
  branchMap: Map<string, string[]>,
  defaultBranch?: string
): NetworkLayout {
  if (commits.length === 0) {
    return { nodes: [], edges: [], laneLabels: [], totalWidth: 0, totalHeight: 0 };
  }

  const db = defaultBranch ?? 'main';

  // Build commit lookup
  const commitByOid = new Map<string, CommitNode>();
  for (const c of commits) commitByOid.set(c.oid, c);

  // Deduplicate & sort by timestamp (oldest first)
  const seen = new Set<string>();
  const unique: CommitNode[] = [];
  for (const c of commits) {
    if (!seen.has(c.oid)) {
      seen.add(c.oid);
      unique.push(c);
    }
  }
  unique.sort(
    (a, b) => new Date(a.committedDate).getTime() - new Date(b.committedDate).getTime()
  );

  // Build first-parent spine of default branch (for lane 0 priority)
  const spine = new Set<string>();
  const defaultCommits = unique
    .filter((c) => (branchMap.get(c.oid) ?? []).includes(db))
    .sort((a, b) => new Date(b.committedDate).getTime() - new Date(a.committedDate).getTime());

  if (defaultCommits.length > 0) {
    let current: CommitNode | undefined = defaultCommits[0];
    while (current) {
      spine.add(current.oid);
      const fpOid: string | undefined = current.parents.nodes[0]?.oid;
      current = fpOid ? commitByOid.get(fpOid) : undefined;
    }
  }

  // ── Lane assignment ──
  // Track which OID each lane is "expecting" next (first parent chain).
  // When we see that OID, the commit takes that lane.
  const laneExpecting: (string | null)[] = []; // lane → expected next OID
  const laneAssignment = new Map<string, number>(); // OID → lane
  const laneLastOid = new Map<number, string>(); // lane → last OID assigned

  function getFreeLane(): number {
    const idx = laneExpecting.indexOf(null);
    if (idx >= 0) return idx;
    laneExpecting.push(null);
    return laneExpecting.length - 1;
  }

  // Process commits in time order (oldest first)
  for (const commit of unique) {
    const oid = commit.oid;

    // Check if any lane is expecting this commit
    let lane = -1;
    for (let i = 0; i < laneExpecting.length; i++) {
      if (laneExpecting[i] === oid) {
        lane = i;
        break;
      }
    }

    if (lane === -1) {
      // No lane expecting this commit — it's a new branch head or root
      // Give spine commits priority for lane 0
      if (spine.has(oid) && (laneExpecting.length === 0 || laneExpecting[0] === null)) {
        if (laneExpecting.length === 0) laneExpecting.push(null);
        lane = 0;
      } else {
        lane = getFreeLane();
      }
    }

    laneAssignment.set(oid, lane);
    laneLastOid.set(lane, oid);

    // This lane now expects the first parent (continuing the line)
    const firstParentOid = commit.parents.nodes[0]?.oid ?? null;
    laneExpecting[lane] = firstParentOid;

    // For merge commits, non-first parents get their own lanes
    // (or reuse a lane that's already expecting them)
    for (let p = 1; p < commit.parents.nodes.length; p++) {
      const pOid = commit.parents.nodes[p]!.oid;
      // Check if any lane already expects this parent
      const existingLane = laneExpecting.indexOf(pOid);
      if (existingLane === -1) {
        // Allocate a new lane for this branch
        const newLane = getFreeLane();
        laneExpecting[newLane] = pOid;
      }
      // If already expected, it'll be picked up naturally
    }
  }

  // ── Build nodes ──
  const maxLane = Math.max(0, ...Array.from(laneAssignment.values()));
  const totalHeight = LANE_PADDING_TOP + (maxLane + 1) * LANE_HEIGHT + 16;
  const totalWidth = X_PADDING_LEFT + (unique.length - 1) * X_GAP + X_PADDING_RIGHT;

  const nodeByOid = new Map<string, NetworkNode>();
  const nodes: NetworkNode[] = unique.map((commit, timeIdx) => {
    const lane = laneAssignment.get(commit.oid) ?? 0;
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
      x: X_PADDING_LEFT + timeIdx * X_GAP,
      y: LANE_PADDING_TOP + lane * LANE_HEIGHT + LANE_HEIGHT / 2,
      lane,
      time: timeIdx,
    };
    nodeByOid.set(commit.oid, node);
    return node;
  });

  // ── Build edges ──
  // Simply connect each commit to ALL its parents.
  // Same-lane = straight line. Cross-lane = curved fork/merge line.
  const edges: NetworkEdge[] = [];
  for (const node of nodes) {
    for (const parentRef of node.parents.nodes) {
      const parent = nodeByOid.get(parentRef.oid);
      if (!parent) continue;
      edges.push({
        sourceOid: node.oid,
        targetOid: parent.oid,
        x1: node.x,
        y1: node.y,
        x2: parent.x,
        y2: parent.y,
        sourceLane: node.lane,
        targetLane: parent.lane,
      });
    }
  }

  // ── Build lane labels ──
  // Find which branch name best describes each lane
  const laneNames = new Map<number, { label: string; isLive: boolean }>();

  // First, try to label lanes from branch heads
  const allBranches = new Set<string>();
  for (const branches of branchMap.values()) {
    for (const b of branches) allBranches.add(b);
  }

  // Find the newest commit on each branch (the tip) and use its lane
  for (const branch of allBranches) {
    const branchCommits = unique
      .filter((c) => (branchMap.get(c.oid) ?? []).includes(branch))
      .sort((a, b) => new Date(b.committedDate).getTime() - new Date(a.committedDate).getTime());

    if (branchCommits.length > 0) {
      const tipLane = laneAssignment.get(branchCommits[0]!.oid);
      if (tipLane !== undefined && !laneNames.has(tipLane)) {
        laneNames.set(tipLane, { label: branch, isLive: true });
      }
    }
  }

  // For unlabeled lanes, try to find a PR headRefName from merge commits
  for (const node of nodes) {
    if (!node.isMerge) continue;
    const commit = commitByOid.get(node.oid)!;
    const prs = commit.associatedPullRequests?.nodes ?? [];
    const mergedPr = prs.find(
      (pr) => pr.state === 'MERGED' && pr.mergeCommit?.oid === commit.oid
    );
    if (mergedPr?.headRefName) {
      // The second parent's lane is the feature branch lane
      const secondParentOid = commit.parents.nodes[1]?.oid;
      if (secondParentOid) {
        const secondParentLane = laneAssignment.get(secondParentOid);
        if (secondParentLane !== undefined && !laneNames.has(secondParentLane)) {
          laneNames.set(secondParentLane, { label: mergedPr.headRefName, isLive: false });
        }
      }
    }
  }

  // Fill any remaining unlabeled lanes with generic names
  for (let i = 0; i <= maxLane; i++) {
    if (!laneNames.has(i)) {
      laneNames.set(i, { label: `branch-${i}`, isLive: false });
    }
  }

  const laneLabels = Array.from(laneNames.entries())
    .map(([lane, info]) => ({ lane, label: info.label, isLive: info.isLive }))
    .sort((a, b) => a.lane - b.lane);

  return {
    nodes,
    edges,
    laneLabels,
    totalWidth,
    totalHeight,
  };
}
