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
  '#58a6ff', '#3fb950', '#bc8cff', '#d29922',
  '#f85149', '#39d353', '#ff7b72', '#79c0ff',
];

export function getLaneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length] ?? '#58a6ff';
}

/**
 * Build the "first-parent spine" of the default branch.
 * This is the linear history following only first parents,
 * which represents main's own commits (not feature branch commits
 * that were merged in).
 */
function buildFirstParentSpine(
  commits: CommitNode[],
  branchMap: Map<string, string[]>,
  defaultBranch: string
): Set<string> {
  const commitByOid = new Map<string, CommitNode>();
  for (const c of commits) commitByOid.set(c.oid, c);

  // Find the newest commit on the default branch (branch tip)
  const defaultCommits = commits
    .filter((c) => (branchMap.get(c.oid) ?? []).includes(defaultBranch))
    .sort((a, b) => new Date(b.committedDate).getTime() - new Date(a.committedDate).getTime());

  if (defaultCommits.length === 0) return new Set();

  const spine = new Set<string>();
  let current: CommitNode | undefined = defaultCommits[0];

  while (current) {
    spine.add(current.oid);
    // Follow first parent only
    const firstParentOid: string | undefined = current.parents.nodes[0]?.oid;
    current = firstParentOid ? commitByOid.get(firstParentOid) : undefined;
  }

  return spine;
}

/**
 * Reconstruct deleted feature branches from merge commits.
 *
 * For each merge commit on main's first-parent spine:
 *   - The second parent points to the tip of the merged feature branch
 *   - Walk backward from that tip, collecting commits until we hit
 *     a commit that's on the first-parent spine (the fork point)
 *   - Those intermediate commits form the virtual branch
 */
function reconstructDeletedBranches(
  commits: CommitNode[],
  branchMap: Map<string, string[]>,
  defaultBranch: string
): {
  virtualBranchCommits: Map<string, CommitNode[]>;
  virtualBranchNames: Set<string>;
} {
  const commitByOid = new Map<string, CommitNode>();
  for (const c of commits) commitByOid.set(c.oid, c);

  const spine = buildFirstParentSpine(commits, branchMap, defaultBranch);
  const virtualBranchCommits = new Map<string, CommitNode[]>();
  const virtualBranchNames = new Set<string>();
  const processedParents = new Set<string>();

  // All live branch names (to avoid conflicts)
  const liveBranches = new Set<string>();
  for (const branches of branchMap.values()) {
    for (const b of branches) liveBranches.add(b);
  }

  // Find merge commits on the spine
  for (const oid of spine) {
    const commit = commitByOid.get(oid);
    if (!commit || commit.parents.nodes.length < 2) continue;

    // Process each non-first parent (merged branches)
    for (let p = 1; p < commit.parents.nodes.length; p++) {
      const tipOid = commit.parents.nodes[p]!.oid;
      if (processedParents.has(tipOid)) continue;
      processedParents.add(tipOid);

      // Get branch name from PR data
      const prs = commit.associatedPullRequests?.nodes ?? [];
      const mergedPr = prs.find(
        (pr) => pr.state === 'MERGED' && pr.mergeCommit?.oid === commit.oid
      );
      const branchName = mergedPr?.headRefName ?? `merged-into-${commit.abbreviatedOid}`;
      if (liveBranches.has(branchName)) continue;

      // Walk backward from tip, collecting commits until we hit the spine
      const branchCommitsList: CommitNode[] = [];
      const visited = new Set<string>();
      const queue = [tipOid];

      while (queue.length > 0) {
        const cOid = queue.shift()!;
        if (visited.has(cOid)) continue;
        visited.add(cOid);

        const c = commitByOid.get(cOid);
        if (!c) continue;

        // If this commit is on the spine, it's the fork point — DON'T add it
        // to the virtual branch commits (it stays on main), but stop walking
        if (spine.has(cOid)) continue;

        branchCommitsList.push(c);

        // Continue walking parents
        for (const parent of c.parents.nodes) {
          if (!visited.has(parent.oid)) {
            queue.push(parent.oid);
          }
        }
      }

      if (branchCommitsList.length > 0) {
        branchCommitsList.sort(
          (a, b) => new Date(a.committedDate).getTime() - new Date(b.committedDate).getTime()
        );
        virtualBranchCommits.set(branchName, branchCommitsList);
        virtualBranchNames.add(branchName);
      }
    }
  }

  return { virtualBranchCommits, virtualBranchNames };
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

  const db = defaultBranch ?? 'main';

  // Reconstruct deleted branches
  const { virtualBranchCommits, virtualBranchNames } =
    reconstructDeletedBranches(commits, branchMap, db);

  // 1. Determine visible branches
  const liveBranchSet = new Set<string>();
  for (const branches of branchMap.values()) {
    for (const b of branches) liveBranchSet.add(b);
  }

  let visibleLive: string[];
  if (selectedBranches && selectedBranches.length > 0) {
    visibleLive = [...liveBranchSet].filter((b) => selectedBranches.includes(b));
  } else {
    visibleLive = [...liveBranchSet];
  }

  // Sort live: default first, then alphabetical
  visibleLive.sort((a, b) => {
    if (a === db) return -1;
    if (b === db) return 1;
    return a.localeCompare(b);
  });

  // Sort virtual alphabetically
  const visibleVirtual = [...virtualBranchNames].sort();

  // Combined: live branches first, then virtual
  const allBranches = [...visibleLive, ...visibleVirtual];

  const branchIndex = new Map<string, number>();
  allBranches.forEach((name, i) => branchIndex.set(name, i));

  // 2. Build first-parent spine for default branch display
  const spine = buildFirstParentSpine(commits, branchMap, db);

  // 3. Collect display commits per branch
  const branchDisplayCommits = new Map<string, CommitNode[]>();

  // Default branch: show spine commits only (first-parent history)
  const spineCommits = commits
    .filter((c) => spine.has(c.oid))
    .sort((a, b) => new Date(a.committedDate).getTime() - new Date(b.committedDate).getTime());
  branchDisplayCommits.set(db, spineCommits);

  // Live non-default branches: show unique commits + fork point
  for (const branch of visibleLive) {
    if (branch === db) continue;
    const bCommits = commits
      .filter((c) => (branchMap.get(c.oid) ?? []).includes(branch))
      .sort((a, b) => new Date(a.committedDate).getTime() - new Date(b.committedDate).getTime());

    const uniqueCommits: CommitNode[] = [];
    let forkCommit: CommitNode | null = null;

    for (const c of bCommits) {
      if (!spine.has(c.oid)) {
        uniqueCommits.push(c);
      } else if (uniqueCommits.length === 0) {
        forkCommit = c;
      }
    }

    const display: CommitNode[] = [];
    if (forkCommit) display.push(forkCommit);
    display.push(...uniqueCommits);

    if (display.length === 0 && bCommits.length > 0) {
      display.push(bCommits[0]!);
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

  // Virtual branches: show all their reconstructed commits
  for (const [branch, vCommits] of virtualBranchCommits) {
    branchDisplayCommits.set(branch, vCommits);
  }

  // 4. Global X positions
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
  const totalHeight = LANE_PADDING_TOP + allBranches.length * LANE_HEIGHT + 16;

  // 5. Build nodes
  const nodes: NetworkNode[] = [];
  const nodeByKey = new Map<string, NetworkNode>();

  for (const branch of allBranches) {
    const lane = branchIndex.get(branch)!;
    const displayCommits = branchDisplayCommits.get(branch) ?? [];
    const isVirtual = virtualBranchNames.has(branch);

    for (const commit of displayCommits) {
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
        isPrimary: branch === db || isVirtual,
        isVirtualBranch: isVirtual,
      };
      nodes.push(node);
      nodeByKey.set(key, node);
    }
  }

  // 6. Build edges
  const edges: NetworkEdge[] = [];
  const edgeSet = new Set<string>();

  // 6a. Within-branch edges: connect consecutive commits
  for (const branch of allBranches) {
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

  // 6b. Cross-lane connectors for live non-default branches
  //     Only draw a fork connector if the branch genuinely forks from default
  //     (i.e., the first displayed commit is a shared spine commit and the
  //     branch has unique commits after it). Skip for long-lived branches
  //     that have sync merges — those are handled by 6d.
  for (const branch of visibleLive) {
    if (branch === db) continue;
    const lane = branchIndex.get(branch)!;
    const displayCommits = branchDisplayCommits.get(branch) ?? [];
    if (displayCommits.length < 2) continue; // Need at least fork point + 1 unique commit

    const firstCommit = displayCommits[0]!;
    const secondCommit = displayCommits[1]!;
    const firstKey = `${firstCommit.oid}:${branch}`;
    const firstNode = nodeByKey.get(firstKey);

    // Only draw fork if: first commit is on spine AND second commit is NOT on spine
    // This means the branch genuinely diverges at this point
    if (firstNode && spine.has(firstCommit.oid) && !spine.has(secondCommit.oid)) {
      const defaultKey = `${firstCommit.oid}:${db}`;
      const defaultNode = nodeByKey.get(defaultKey);
      if (defaultNode) {
        const edgeKey = `fork:${defaultKey}->${firstKey}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            sourceKey: defaultKey, targetKey: firstKey,
            x1: defaultNode.x, y1: defaultNode.y,
            x2: firstNode.x, y2: firstNode.y,
            color: getLaneColor(lane), isCrossLane: true,
          });
        }
      }
    } else if (firstNode && !spine.has(firstCommit.oid)) {
      // First unique commit — connect from parent on default branch
      for (const parentRef of firstCommit.parents.nodes) {
        const parentDefaultKey = `${parentRef.oid}:${db}`;
        const parentNode = nodeByKey.get(parentDefaultKey);
        if (parentNode) {
          const edgeKey = `fork:${parentDefaultKey}->${firstKey}`;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edges.push({
              sourceKey: parentDefaultKey, targetKey: firstKey,
              x1: parentNode.x, y1: parentNode.y,
              x2: firstNode.x, y2: firstNode.y,
              color: getLaneColor(lane), isCrossLane: true,
            });
          }
          break;
        }
      }
    }
  }

  // 6c. Cross-lane connectors for virtual branches
  //     Fork: from spine commit (parent of first virtual commit) to first virtual commit
  //     Merge: from last virtual commit to the merge commit on spine
  for (const branch of visibleVirtual) {
    const lane = branchIndex.get(branch)!;
    const displayCommits = branchDisplayCommits.get(branch) ?? [];
    if (displayCommits.length === 0) continue;

    const firstVirtual = displayCommits[0]!;
    const firstKey = `${firstVirtual.oid}:${branch}`;
    const firstNode = nodeByKey.get(firstKey);

    // Fork connector: find parent of first virtual commit that's on the spine
    if (firstNode) {
      for (const parentRef of firstVirtual.parents.nodes) {
        if (spine.has(parentRef.oid)) {
          const spineKey = `${parentRef.oid}:${db}`;
          const spineNode = nodeByKey.get(spineKey);
          if (spineNode) {
            const edgeKey = `vfork:${spineKey}->${firstKey}`;
            if (!edgeSet.has(edgeKey)) {
              edgeSet.add(edgeKey);
              edges.push({
                sourceKey: spineKey, targetKey: firstKey,
                x1: spineNode.x, y1: spineNode.y,
                x2: firstNode.x, y2: firstNode.y,
                color: getLaneColor(lane), isCrossLane: true,
              });
            }
            break;
          }
        }
      }
    }

    // Merge connector: find the merge commit on spine that references the last virtual commit
    const lastVirtual = displayCommits[displayCommits.length - 1]!;
    const lastKey = `${lastVirtual.oid}:${branch}`;
    const lastNode = nodeByKey.get(lastKey);

    if (lastNode) {
      // Search spine for merge commit whose second parent is this commit
      for (const oid of spine) {
        const spineCommit = commitByOid.get(oid);
        if (!spineCommit || spineCommit.parents.nodes.length < 2) continue;

        for (let p = 1; p < spineCommit.parents.nodes.length; p++) {
          if (spineCommit.parents.nodes[p]!.oid === lastVirtual.oid) {
            const mergeKey = `${spineCommit.oid}:${db}`;
            const mergeNode = nodeByKey.get(mergeKey);
            if (mergeNode) {
              const edgeKey = `vmerge:${lastKey}->${mergeKey}`;
              if (!edgeSet.has(edgeKey)) {
                edgeSet.add(edgeKey);
                edges.push({
                  sourceKey: lastKey, targetKey: mergeKey,
                  x1: lastNode.x, y1: lastNode.y,
                  x2: mergeNode.x, y2: mergeNode.y,
                  color: getLaneColor(lane), isCrossLane: true,
                });
              }
            }
          }
        }
      }
    }
  }

  // 6d. Generic cross-branch merge connectors
  //     For merge commits, connect NON-FIRST parents to their branch.
  //     First parent = same branch continuation (handled by 6a).
  //     Non-first parents = incoming merges from other branches.
  //     Only draw if this edge wasn't already created by 6b/6c.
  //     Prefer connecting to the most specific branch (virtual > live non-default).
  for (const node of nodes) {
    if (!node.isMerge) continue;

    // Only process non-first parents (the merged-in branches)
    for (let p = 1; p < node.parents.nodes.length; p++) {
      const parentOid = node.parents.nodes[p]!.oid;

      // Find the best branch to connect to for this parent:
      // Priority: same virtual branch > other virtual branch > live non-default > default
      let bestParentNode: NetworkNode | null = null;
      let bestPriority = -1;

      for (const otherBranch of allBranches) {
        if (otherBranch === node.branch) continue;
        const parentKey = `${parentOid}:${otherBranch}`;
        const parentNode = nodeByKey.get(parentKey);
        if (!parentNode) continue;

        let priority = 0;
        if (virtualBranchNames.has(otherBranch)) priority = 3;
        else if (otherBranch !== db) priority = 2;
        else priority = 1;

        if (priority > bestPriority) {
          bestPriority = priority;
          bestParentNode = parentNode;
        }
      }

      if (bestParentNode) {
        const edgeKey = `xmerge:${bestParentNode.nodeKey}->${node.nodeKey}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            sourceKey: bestParentNode.nodeKey,
            targetKey: node.nodeKey,
            x1: bestParentNode.x,
            y1: bestParentNode.y,
            x2: node.x,
            y2: node.y,
            color: getLaneColor(bestParentNode.lane),
            isCrossLane: true,
          });
        }
      }
    }
  }

  return {
    nodes,
    edges,
    branches: allBranches,
    virtualBranches: virtualBranchNames,
    totalWidth,
    totalHeight,
  };
}
