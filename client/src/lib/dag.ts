// DAG layout utilities for commit graph visualization
// Uses custom topological lane-based layout (no d3-dag dependency)

import type { CommitNode } from './api.js';

export interface DagNode {
  oid: string;
  abbreviatedOid: string;
  message: string;
  committedDate: string;
  author: CommitNode['author'];
  parents: { nodes: { oid: string }[] };
  additions: number;
  deletions: number;
  // Layout properties
  lane: number;
  row: number;
  x: number;
  y: number;
  isMerge: boolean;
}

const LANE_WIDTH = 24;
const ROW_HEIGHT = 48;
const NODE_RADIUS = 8;

export const GRAPH_CONSTANTS = {
  LANE_WIDTH,
  ROW_HEIGHT,
  NODE_RADIUS,
};

/**
 * Build a DAG layout from a flat list of commits.
 * Assigns lanes and coordinates for SVG rendering.
 */
export function buildDag(
  commits: CommitNode[],
  branchMap?: Map<string, string>
): DagNode[] {
  if (commits.length === 0) return [];

  // Deduplicate by SHA
  const seen = new Set<string>();
  const unique: CommitNode[] = [];
  for (const c of commits) {
    if (!seen.has(c.oid)) {
      seen.add(c.oid);
      unique.push(c);
    }
  }

  // Build a map for quick lookup
  const commitMap = new Map<string, CommitNode>();
  for (const c of unique) {
    commitMap.set(c.oid, c);
  }

  // Topological sort (Kahn's algorithm)
  // Build in-degree count based on parent relationships within our set
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>(); // parent → children

  for (const c of unique) {
    if (!inDegree.has(c.oid)) inDegree.set(c.oid, 0);
    for (const parent of c.parents.nodes) {
      if (commitMap.has(parent.oid)) {
        inDegree.set(c.oid, (inDegree.get(c.oid) ?? 0) + 1);
        if (!children.has(parent.oid)) children.set(parent.oid, []);
        children.get(parent.oid)!.push(c.oid);
      }
    }
  }

  // Start with commits that have no parents in our set (newest commits at top)
  const queue: string[] = [];
  for (const c of unique) {
    if ((inDegree.get(c.oid) ?? 0) === 0) {
      queue.push(c.oid);
    }
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const oid = queue.shift()!;
    sorted.push(oid);
    for (const child of children.get(oid) ?? []) {
      const deg = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, deg);
      if (deg === 0) queue.push(child);
    }
  }

  // If there are cycles or unreachable nodes, append remaining
  for (const c of unique) {
    if (!sorted.includes(c.oid)) sorted.push(c.oid);
  }

  // Lane assignment
  // Track which lanes are "in use" (have an ongoing branch line)
  // A lane is freed when its commit's children are all assigned
  const laneAssignment = new Map<string, number>();
  const activeLanes: (string | null)[] = []; // lane index → current "tip" oid

  function getFreeLane(): number {
    const idx = activeLanes.indexOf(null);
    if (idx >= 0) return idx;
    activeLanes.push(null);
    return activeLanes.length - 1;
  }

  for (const oid of sorted) {
    const commit = commitMap.get(oid)!;
    const isMerge = commit.parents.nodes.length > 1;

    // Check if any active lane is waiting for this commit as a child
    let assignedLane = -1;

    // Find if a parent of this commit already has a lane
    for (let i = 0; i < activeLanes.length; i++) {
      const laneOid = activeLanes[i];
      if (laneOid !== null) {
        const laneCommit = commitMap.get(laneOid);
        if (laneCommit) {
          const parentOids = laneCommit.parents.nodes.map((p) => p.oid);
          if (parentOids.includes(oid) && assignedLane === -1) {
            assignedLane = i;
            activeLanes[i] = oid;
          }
        }
      }
    }

    if (assignedLane === -1) {
      assignedLane = getFreeLane();
      activeLanes[assignedLane] = oid;
    }

    // Apply branch hint from branchMap if available
    if (branchMap) {
      const hint = branchMap.get(oid);
      if (hint) {
        if (hint === 'main' || hint === 'master') {
          assignedLane = 0;
        } else if (hint === 'develop' || hint === 'dev') {
          if (assignedLane > 1) assignedLane = 1;
        }
      }
    }

    laneAssignment.set(oid, assignedLane);

    // Free lanes for parents that won't be needed by other commits
    for (const parentRef of commit.parents.nodes) {
      const parentOid = parentRef.oid;
      // Check if any other non-processed commit needs this parent
      const parentLaneIdx = activeLanes.indexOf(parentOid);
      if (parentLaneIdx >= 0 && isMerge) {
        // Keep the parent lane alive if it's the main parent (index 0)
        const isFirstParent = commit.parents.nodes[0]?.oid === parentOid;
        if (!isFirstParent) {
          activeLanes[parentLaneIdx] = null;
        }
      }
    }
  }

  // Build DagNode array with coordinates
  return sorted.map((oid, row) => {
    const commit = commitMap.get(oid)!;
    const lane = laneAssignment.get(oid) ?? 0;
    const isMerge = commit.parents.nodes.length > 1;

    return {
      oid: commit.oid,
      abbreviatedOid: commit.abbreviatedOid,
      message: commit.message,
      committedDate: commit.committedDate,
      author: commit.author,
      parents: commit.parents,
      additions: commit.additions,
      deletions: commit.deletions,
      lane,
      row,
      x: lane * LANE_WIDTH + NODE_RADIUS + 8,
      y: row * ROW_HEIGHT + ROW_HEIGHT / 2,
      isMerge,
    };
  });
}

/**
 * Calculate total SVG width needed for the graph.
 */
export function calcGraphWidth(nodes: DagNode[]): number {
  const maxLane = nodes.reduce((m, n) => Math.max(m, n.lane), 0);
  return (maxLane + 1) * LANE_WIDTH + NODE_RADIUS * 2 + 16;
}

/**
 * Calculate total SVG height needed for the graph.
 */
export function calcGraphHeight(nodes: DagNode[]): number {
  return nodes.length * ROW_HEIGHT + ROW_HEIGHT;
}
