// DAG layout utilities for commit graph visualization
// Uses a simple first-parent lane assignment like `git log --graph`

import type { CommitNode } from './github-api.js';

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
const ROW_HEIGHT = 40;
const NODE_RADIUS = 6;
const GRAPH_LEFT_PAD = 16;

export const GRAPH_CONSTANTS = {
  LANE_WIDTH,
  ROW_HEIGHT,
  NODE_RADIUS,
};

/**
 * Build a DAG layout from a flat list of commits.
 * Commits are expected in reverse-chronological order (newest first).
 * Lane assignment follows first-parent: a commit inherits its child's lane
 * via the first-parent link, keeping linear history in a straight column.
 */
export function buildDag(
  commits: CommitNode[],
  branchMap?: Map<string, string[]>,
  defaultBranch?: string
): DagNode[] {
  if (commits.length === 0) return [];

  // Deduplicate by SHA, preserve order
  const seen = new Set<string>();
  const unique: CommitNode[] = [];
  for (const c of commits) {
    if (!seen.has(c.oid)) {
      seen.add(c.oid);
      unique.push(c);
    }
  }

  // We process commits top-to-bottom (newest→oldest).
  // `activeLanes` tracks which OID each lane column is currently expecting next.
  // When we encounter a commit, we check if any lane is expecting it (as a
  // first-parent). If yes, the commit takes that lane. If no, it gets a new lane.

  const activeLanes: (string | null)[] = []; // lane index → expected OID
  const laneAssignment = new Map<string, number>();

  function getFreeLane(preferLane0 = false): number {
    if (preferLane0) {
      // Lane 0 is free if it hasn't been allocated yet or is null
      if (activeLanes.length === 0 || activeLanes[0] === null) {
        if (activeLanes.length === 0) activeLanes.push(null);
        return 0;
      }
    }
    const idx = activeLanes.indexOf(null);
    if (idx >= 0) return idx;
    activeLanes.push(null);
    return activeLanes.length - 1;
  }

  for (const commit of unique) {
    const oid = commit.oid;

    // Find if any lane is expecting this commit
    let lane = -1;
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] === oid) {
        lane = i;
        break;
      }
    }

    if (lane === -1) {
      // New branch head — if this commit belongs only to the default branch,
      // prefer lane 0 to keep the main history in the leftmost column.
      const commitBranches = branchMap?.get(oid);
      const isDefaultOnly =
        !!defaultBranch &&
        !!commitBranches &&
        commitBranches.length === 1 &&
        commitBranches[0] === defaultBranch;
      lane = getFreeLane(isDefaultOnly);
    }

    laneAssignment.set(oid, lane);

    const firstParentOid = commit.parents.nodes[0]?.oid ?? null;

    // This lane now expects the first parent
    activeLanes[lane] = firstParentOid;

    // For merge commits, the non-first parents each get their own lane
    // (or reuse an existing one if already tracked)
    for (let p = 1; p < commit.parents.nodes.length; p++) {
      const pOid = commit.parents.nodes[p]!.oid;
      // Check if this parent is already expected by some lane
      const existingLane = activeLanes.indexOf(pOid);
      if (existingLane === -1) {
        // Allocate a new lane for this branch
        const newLane = getFreeLane();
        activeLanes[newLane] = pOid;
      }
      // If already tracked, that lane will pick it up naturally
    }
  }

  // Build DagNode array with coordinates
  return unique.map((commit, row) => {
    const lane = laneAssignment.get(commit.oid) ?? 0;
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
      x: lane * LANE_WIDTH + GRAPH_LEFT_PAD,
      y: row * ROW_HEIGHT + ROW_HEIGHT / 2,
      isMerge,
    };
  });
}

/**
 * Calculate total SVG width needed for the graph columns only.
 */
export function calcGraphWidth(nodes: DagNode[]): number {
  const maxLane = nodes.reduce((m, n) => Math.max(m, n.lane), 0);
  return (maxLane + 1) * LANE_WIDTH + GRAPH_LEFT_PAD + NODE_RADIUS + 8;
}

/**
 * Calculate total SVG height needed for the graph.
 */
export function calcGraphHeight(nodes: DagNode[]): number {
  return nodes.length * ROW_HEIGHT + ROW_HEIGHT;
}
