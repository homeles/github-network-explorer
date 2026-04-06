// Network DAG layout: horizontal timeline with branch lanes
// GitHub-style: each branch gets its own Y-row, commits on X-axis by time
// Only unique/divergent commits per branch + fork/merge connectors

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
  branch: string;
  lane: number;
  nodeKey: string;
  /** True if this is the commit's "primary" branch (shown with full opacity) */
  isPrimary: boolean;
}

export interface NetworkEdge {
  sourceKey: string;
  targetKey: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  /** True for cross-lane fork/merge connections */
  isCrossLane: boolean;
}

export interface NetworkLayout {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  branches: string[];
  totalWidth: number;
  totalHeight: number;
}

const LANE_HEIGHT = 40;
const LANE_PADDING_TOP = 32;
const MIN_X_GAP = 28;
const NODE_PADDING_LEFT = 20;
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

export function buildNetworkLayout(
  commits: CommitNode[],
  branchMap: Map<string, string[]>,
  defaultBranch?: string,
  selectedBranches?: string[]
): NetworkLayout {
  if (commits.length === 0) {
    return { nodes: [], edges: [], branches: [], totalWidth: 0, totalHeight: 0 };
  }

  const commitByOid = new Map<string, CommitNode>();
  for (const c of commits) commitByOid.set(c.oid, c);

  // 1. Determine visible branches
  const branchSet = new Set<string>();
  for (const branches of branchMap.values()) {
    for (const b of branches) branchSet.add(b);
  }

  const visibleBranches = selectedBranches && selectedBranches.length > 0
    ? [...branchSet].filter((b) => selectedBranches.includes(b))
    : [...branchSet];

  visibleBranches.sort((a, b) => {
    if (a === defaultBranch) return -1;
    if (b === defaultBranch) return 1;
    return a.localeCompare(b);
  });

  const branchIndex = new Map<string, number>();
  visibleBranches.forEach((name, i) => branchIndex.set(name, i));

  // 2. Collect commits per branch
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
  // Sort oldest first
  for (const [, arr] of branchCommits) {
    arr.sort((a, b) => new Date(a.committedDate).getTime() - new Date(b.committedDate).getTime());
  }

  // 3. Primary branch: lowest index that contains the commit
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

  // 4. For each non-default branch, find its "unique" commits
  //    (commits NOT on the default branch, or the branch-specific divergent area)
  //    Plus the fork point (first shared commit) and merge point (last shared commit)
  const defaultCommitSet = new Set<string>();
  for (const c of (branchCommits.get(defaultBranch ?? '') ?? [])) {
    defaultCommitSet.add(c.oid);
  }

  // Build set of commits to show per branch
  const branchDisplayCommits = new Map<string, CommitNode[]>();

  for (const branch of visibleBranches) {
    const bCommits = branchCommits.get(branch) ?? [];

    if (branch === defaultBranch) {
      // Default branch shows all its commits
      branchDisplayCommits.set(branch, bCommits);
      continue;
    }

    // For feature branches: show unique commits + fork/merge boundary commits
    const uniqueCommits: CommitNode[] = [];
    let forkCommit: CommitNode | null = null;

    for (const c of bCommits) {
      if (!defaultCommitSet.has(c.oid)) {
        // Unique to this branch
        uniqueCommits.push(c);
      } else if (uniqueCommits.length === 0) {
        // This is a shared commit before divergence — track as potential fork point
        forkCommit = c;
      }
    }

    const display: CommitNode[] = [];
    if (forkCommit) display.push(forkCommit);
    display.push(...uniqueCommits);

    // If branch has ONLY shared commits (no unique ones), show first + last
    if (uniqueCommits.length === 0 && bCommits.length > 0) {
      display.push(bCommits[0]!);
      if (bCommits.length > 1) display.push(bCommits[bCommits.length - 1]!);
    }

    // Deduplicate and sort
    const seen = new Set<string>();
    const deduped = display.filter((c) => {
      if (seen.has(c.oid)) return false;
      seen.add(c.oid);
      return true;
    });
    deduped.sort((a, b) => new Date(a.committedDate).getTime() - new Date(b.committedDate).getTime());

    branchDisplayCommits.set(branch, deduped);
  }

  // 5. Global X positions — based on all commits sorted by time
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

  // 6. Build nodes
  const nodes: NetworkNode[] = [];
  const nodeByKey = new Map<string, NetworkNode>();

  for (const branch of visibleBranches) {
    const lane = branchIndex.get(branch)!;
    const displayCommits = branchDisplayCommits.get(branch) ?? [];

    for (const commit of displayCommits) {
      const key = `${commit.oid}:${branch}`;
      const primary = commitPrimary.get(commit.oid);
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
        isPrimary: primary === branch,
      };
      nodes.push(node);
      nodeByKey.set(key, node);
    }
  }

  // 7. Build edges
  const edges: NetworkEdge[] = [];
  const edgeSet = new Set<string>();

  // 7a. Within-branch edges: connect consecutive displayed commits on same branch
  for (const branch of visibleBranches) {
    const lane = branchIndex.get(branch)!;
    const displayCommits = branchDisplayCommits.get(branch) ?? [];

    for (let i = 1; i < displayCommits.length; i++) {
      const child = displayCommits[i]!;
      const parent = displayCommits[i - 1]!;
      const childKey = `${child.oid}:${branch}`;
      const parentKey = `${parent.oid}:${branch}`;
      const childNode = nodeByKey.get(childKey);
      const parentNode = nodeByKey.get(parentKey);

      if (childNode && parentNode) {
        const edgeKey = `lane:${childKey}->${parentKey}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            sourceKey: childKey,
            targetKey: parentKey,
            x1: childNode.x,
            y1: childNode.y,
            x2: parentNode.x,
            y2: parentNode.y,
            color: getLaneColor(lane),
            isCrossLane: false,
          });
        }
      }
    }
  }

  // 7b. Cross-lane fork/merge connectors
  for (const branch of visibleBranches) {
    if (branch === defaultBranch) continue;
    const lane = branchIndex.get(branch)!;
    const displayCommits = branchDisplayCommits.get(branch) ?? [];
    if (displayCommits.length === 0) continue;

    // Fork: first commit on this branch — connect from default branch instance
    const firstCommit = displayCommits[0]!;
    const firstKey = `${firstCommit.oid}:${branch}`;
    const firstNode = nodeByKey.get(firstKey);

    if (firstNode && defaultCommitSet.has(firstCommit.oid) && defaultBranch) {
      // This is a shared commit — connect from default branch lane
      const defaultKey = `${firstCommit.oid}:${defaultBranch}`;
      const defaultNode = nodeByKey.get(defaultKey);
      if (defaultNode && defaultNode.nodeKey !== firstNode.nodeKey) {
        const edgeKey = `fork:${defaultKey}->${firstKey}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            sourceKey: defaultKey,
            targetKey: firstKey,
            x1: defaultNode.x,
            y1: defaultNode.y,
            x2: firstNode.x,
            y2: firstNode.y,
            color: getLaneColor(lane),
            isCrossLane: true,
          });
        }
      }
    } else if (firstNode && !defaultCommitSet.has(firstCommit.oid)) {
      // First unique commit — find its parent on default branch
      for (const parentRef of firstCommit.parents.nodes) {
        if (defaultBranch) {
          const parentDefaultKey = `${parentRef.oid}:${defaultBranch}`;
          const parentNode = nodeByKey.get(parentDefaultKey);
          if (parentNode) {
            const edgeKey = `fork:${parentDefaultKey}->${firstKey}`;
            if (!edgeSet.has(edgeKey)) {
              edgeSet.add(edgeKey);
              edges.push({
                sourceKey: parentDefaultKey,
                targetKey: firstKey,
                x1: parentNode.x,
                y1: parentNode.y,
                x2: firstNode.x,
                y2: firstNode.y,
                color: getLaneColor(lane),
                isCrossLane: true,
              });
            }
            break;
          }
        }
      }
    }

    // Merge: look for merge commits on default branch that have a parent on this branch
    if (defaultBranch) {
      const defaultDisplayCommits = branchDisplayCommits.get(defaultBranch) ?? [];
      for (const dc of defaultDisplayCommits) {
        if (dc.parents.nodes.length < 2) continue;

        const dcKey = `${dc.oid}:${defaultBranch}`;
        const dcNode = nodeByKey.get(dcKey);
        if (!dcNode) continue;

        // Check if any of the non-first parents are on this feature branch
        for (let p = 1; p < dc.parents.nodes.length; p++) {
          const parentOid = dc.parents.nodes[p]!.oid;
          const parentFeatureKey = `${parentOid}:${branch}`;
          const parentNode = nodeByKey.get(parentFeatureKey);
          if (parentNode) {
            const edgeKey = `merge:${parentFeatureKey}->${dcKey}`;
            if (!edgeSet.has(edgeKey)) {
              edgeSet.add(edgeKey);
              edges.push({
                sourceKey: parentFeatureKey,
                targetKey: dcKey,
                x1: parentNode.x,
                y1: parentNode.y,
                x2: dcNode.x,
                y2: dcNode.y,
                color: getLaneColor(lane),
                isCrossLane: true,
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
