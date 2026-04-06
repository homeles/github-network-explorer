// Network DAG layout: horizontal timeline with branch lanes
// GitHub-style: each branch gets its own Y-row, commits on X-axis by time
// Reconstructs deleted feature branches from merge commit topology + PR data

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
  isPrimary: boolean;
  /** True if this branch was deleted (reconstructed from merge commits) */
  isVirtualBranch: boolean;
}

export interface NetworkEdge {
  sourceKey: string;
  targetKey: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  isCrossLane: boolean;
}

export interface NetworkLayout {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  branches: string[];
  /** Maps branch name → true if it's a virtual (deleted) branch */
  virtualBranches: Set<string>;
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

/**
 * Reconstruct deleted feature branches from merge commit topology.
 *
 * Strategy: For merge commits on the default branch, the second parent
 * points to the tip of the feature branch that was merged. If that parent
 * isn't on any known live branch, we walk backward from that parent until
 * we hit a commit that IS on the default branch — those commits form a
 * "virtual" (deleted) feature branch.
 *
 * We use associatedPullRequests.headRefName for the branch name when available.
 */
function reconstructDeletedBranches(
  commits: CommitNode[],
  branchMap: Map<string, string[]>,
  defaultBranch: string
): {
  virtualBranches: Map<string, CommitNode[]>; // branchName → commits
  virtualBranchNames: Set<string>;
  updatedBranchMap: Map<string, string[]>;
} {
  const commitByOid = new Map<string, CommitNode>();
  for (const c of commits) commitByOid.set(c.oid, c);

  // All commits on the default branch
  const defaultOids = new Set<string>();
  for (const [oid, branches] of branchMap) {
    if (branches.includes(defaultBranch)) defaultOids.add(oid);
  }

  const virtualBranches = new Map<string, CommitNode[]>();
  const virtualBranchNames = new Set<string>();
  const updatedBranchMap = new Map<string, string[]>(branchMap);
  const processedSecondParents = new Set<string>();

  // Find merge commits on default branch
  for (const commit of commits) {
    if (!defaultOids.has(commit.oid)) continue;
    if (commit.parents.nodes.length < 2) continue;

    // For each non-first parent (the merged branch tip)
    for (let p = 1; p < commit.parents.nodes.length; p++) {
      const secondParentOid = commit.parents.nodes[p]!.oid;

      // Skip if this parent is on a live branch already
      const parentBranches = branchMap.get(secondParentOid) ?? [];
      const isOnNonDefaultLiveBranch = parentBranches.some((b) => b !== defaultBranch);
      if (isOnNonDefaultLiveBranch) continue;

      // Skip if already processed
      if (processedSecondParents.has(secondParentOid)) continue;
      processedSecondParents.add(secondParentOid);

      // Determine branch name from PR data
      const prs = commit.associatedPullRequests?.nodes ?? [];
      const mergedPr = prs.find(
        (pr) => pr.state === 'MERGED' && pr.mergeCommit?.oid === commit.oid
      );
      const branchName = (mergedPr?.headRefName)
        ? mergedPr.headRefName
        : `merged-into-${commit.abbreviatedOid}`;

      // Skip if we already have a live branch with this name
      if (!branchName || branchMap.has(branchName)) continue;

      // Walk backward from secondParent collecting commits for this virtual branch
      const branchCommits: CommitNode[] = [];
      const visited = new Set<string>();
      const queue = [secondParentOid];

      while (queue.length > 0) {
        const oid = queue.shift()!;
        if (visited.has(oid)) continue;
        visited.add(oid);

        const c = commitByOid.get(oid);
        if (!c) continue;

        // Stop if we reach a commit on the default branch (fork point)
        if (defaultOids.has(oid) && oid !== secondParentOid) continue;

        branchCommits.push(c);

        // Update branchMap
        const existing = updatedBranchMap.get(oid) ?? [];
        if (!existing.includes(branchName)) {
          updatedBranchMap.set(oid, [...existing, branchName]);
        }

        // Continue walking parents
        for (const parent of c.parents.nodes) {
          if (!visited.has(parent.oid)) {
            queue.push(parent.oid);
          }
        }
      }

      if (branchCommits.length > 0) {
        // Sort oldest first
        branchCommits.sort(
          (a, b) => new Date(a.committedDate).getTime() - new Date(b.committedDate).getTime()
        );
        virtualBranches.set(branchName, branchCommits);
        virtualBranchNames.add(branchName);
      }
    }
  }

  return { virtualBranches, virtualBranchNames, updatedBranchMap };
}

export function buildNetworkLayout(
  commits: CommitNode[],
  branchMap: Map<string, string[]>,
  defaultBranch?: string,
  selectedBranches?: string[]
): NetworkLayout {
  if (commits.length === 0) {
    return { nodes: [], edges: [], branches: [], virtualBranches: new Set(), totalWidth: 0, totalHeight: 0 };
  }

  const commitByOid = new Map<string, CommitNode>();
  for (const c of commits) commitByOid.set(c.oid, c);

  // Reconstruct deleted feature branches
  const { virtualBranchNames, updatedBranchMap } =
    reconstructDeletedBranches(commits, branchMap, defaultBranch ?? 'main');

  // 1. Determine all branches (live + virtual)
  const branchSet = new Set<string>();
  for (const branches of updatedBranchMap.values()) {
    for (const b of branches) branchSet.add(b);
  }

  // Filter to selected or all
  let visibleBranches: string[];
  if (selectedBranches && selectedBranches.length > 0) {
    // Include selected live branches + all virtual branches
    visibleBranches = [...branchSet].filter(
      (b) => selectedBranches.includes(b) || virtualBranchNames.has(b)
    );
  } else {
    visibleBranches = [...branchSet];
  }

  // Sort: default branch first, then live branches alphabetically, then virtual branches
  visibleBranches.sort((a, b) => {
    if (a === defaultBranch) return -1;
    if (b === defaultBranch) return 1;
    const aVirtual = virtualBranchNames.has(a);
    const bVirtual = virtualBranchNames.has(b);
    if (!aVirtual && bVirtual) return -1;
    if (aVirtual && !bVirtual) return 1;
    return a.localeCompare(b);
  });

  const branchIndex = new Map<string, number>();
  visibleBranches.forEach((name, i) => branchIndex.set(name, i));

  // 2. Collect commits per branch using updated map
  const branchCommitsMap = new Map<string, CommitNode[]>();
  for (const branch of visibleBranches) {
    branchCommitsMap.set(branch, []);
  }
  for (const commit of commits) {
    const branches = updatedBranchMap.get(commit.oid) ?? [];
    for (const b of branches) {
      if (branchIndex.has(b)) {
        branchCommitsMap.get(b)!.push(commit);
      }
    }
  }
  for (const [, arr] of branchCommitsMap) {
    arr.sort((a, b) => new Date(a.committedDate).getTime() - new Date(b.committedDate).getTime());
  }

  // 3. Primary branch per commit
  const commitPrimary = new Map<string, string>();
  for (const commit of commits) {
    const branches = updatedBranchMap.get(commit.oid) ?? [];
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

  // 4. Default branch commits set
  const defaultCommitSet = new Set<string>();
  for (const c of (branchCommitsMap.get(defaultBranch ?? '') ?? [])) {
    defaultCommitSet.add(c.oid);
  }

  // 5. Display commits per branch
  const branchDisplayCommits = new Map<string, CommitNode[]>();

  for (const branch of visibleBranches) {
    const bCommits = branchCommitsMap.get(branch) ?? [];

    if (branch === defaultBranch) {
      branchDisplayCommits.set(branch, bCommits);
      continue;
    }

    // For feature branches (live or virtual): show unique commits + fork point
    const uniqueCommits: CommitNode[] = [];
    let forkCommit: CommitNode | null = null;

    for (const c of bCommits) {
      if (!defaultCommitSet.has(c.oid)) {
        uniqueCommits.push(c);
      } else if (uniqueCommits.length === 0) {
        forkCommit = c;
      }
    }

    const display: CommitNode[] = [];
    if (forkCommit) display.push(forkCommit);
    display.push(...uniqueCommits);

    if (uniqueCommits.length === 0 && bCommits.length > 0) {
      display.push(bCommits[0]!);
      if (bCommits.length > 1) display.push(bCommits[bCommits.length - 1]!);
    }

    const seen = new Set<string>();
    const deduped = display.filter((c) => {
      if (seen.has(c.oid)) return false;
      seen.add(c.oid);
      return true;
    });
    deduped.sort((a, b) => new Date(a.committedDate).getTime() - new Date(b.committedDate).getTime());
    branchDisplayCommits.set(branch, deduped);
  }

  // 6. Global X positions
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

  // 7. Build nodes
  const nodes: NetworkNode[] = [];
  const nodeByKey = new Map<string, NetworkNode>();

  for (const branch of visibleBranches) {
    const lane = branchIndex.get(branch)!;
    const displayCommits = branchDisplayCommits.get(branch) ?? [];
    const isVirtual = virtualBranchNames.has(branch);

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
        isVirtualBranch: isVirtual,
      };
      nodes.push(node);
      nodeByKey.set(key, node);
    }
  }

  // 8. Build edges
  const edges: NetworkEdge[] = [];
  const edgeSet = new Set<string>();

  // 8a. Within-branch edges
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

  // 8b. Cross-lane fork/merge connectors
  for (const branch of visibleBranches) {
    if (branch === defaultBranch) continue;
    const lane = branchIndex.get(branch)!;
    const displayCommits = branchDisplayCommits.get(branch) ?? [];
    if (displayCommits.length === 0) continue;

    // Fork connector
    const firstCommit = displayCommits[0]!;
    const firstKey = `${firstCommit.oid}:${branch}`;
    const firstNode = nodeByKey.get(firstKey);

    if (firstNode && defaultCommitSet.has(firstCommit.oid) && defaultBranch) {
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
      // First unique commit — connect from parent on default branch
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

    // Merge connector: find merge commit on default branch whose 2nd parent is on this branch
    if (defaultBranch) {
      const defaultDisplayCommits = branchDisplayCommits.get(defaultBranch) ?? [];
      for (const dc of defaultDisplayCommits) {
        if (dc.parents.nodes.length < 2) continue;

        const dcKey = `${dc.oid}:${defaultBranch}`;
        const dcNode = nodeByKey.get(dcKey);
        if (!dcNode) continue;

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

      // Also: last commit on this branch → merge commit on default (if not already connected)
      const lastCommit = displayCommits[displayCommits.length - 1]!;
      const lastKey = `${lastCommit.oid}:${branch}`;
      const lastNode = nodeByKey.get(lastKey);
      if (lastNode) {
        // Find the merge commit on default that references this commit as parent
        for (const dc of defaultDisplayCommits) {
          if (dc.parents.nodes.length < 2) continue;
          for (let p = 1; p < dc.parents.nodes.length; p++) {
            if (dc.parents.nodes[p]!.oid === lastCommit.oid) {
              const dcKey = `${dc.oid}:${defaultBranch}`;
              const dcNode = nodeByKey.get(dcKey);
              if (dcNode) {
                const edgeKey = `mergetip:${lastKey}->${dcKey}`;
                if (!edgeSet.has(edgeKey)) {
                  edgeSet.add(edgeKey);
                  edges.push({
                    sourceKey: lastKey,
                    targetKey: dcKey,
                    x1: lastNode.x,
                    y1: lastNode.y,
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
    }
  }

  return {
    nodes,
    edges,
    branches: visibleBranches,
    virtualBranches: virtualBranchNames,
    totalWidth,
    totalHeight,
  };
}
