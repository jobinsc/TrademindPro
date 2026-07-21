/**
 * Server-only: load edge policy from Blink study memory on disk.
 * Do not import this from client components.
 */

import { loadBlinkStudyMemory } from '@/lib/blink-study-memory';
import {
  DEFAULT_EDGE_POLICY,
  syncEdgePolicyFromGrade,
  type EdgePolicy,
} from '@/lib/blink-edge-policy';

export async function loadEdgePolicy(): Promise<EdgePolicy> {
  try {
    const mem = await loadBlinkStudyMemory();
    if (mem.gradeSummary) return syncEdgePolicyFromGrade(mem.gradeSummary);
  } catch {
    /* fall through */
  }
  return {
    ...DEFAULT_EDGE_POLICY,
    skipSetups: [...DEFAULT_EDGE_POLICY.skipSetups],
    preferSetups: [...DEFAULT_EDGE_POLICY.preferSetups],
    fromGrade: false,
    gradedWinRate: null,
    lessons: ['Using default edge policy (no grade memory on disk).'],
  };
}
