/**
 * src/services/contracts/workflow.dto.ts
 *
 * Data-transfer objects for WorkflowService operations.
 */

export interface WorkflowActionValidationResult {
  valid: boolean;
  reason?: string;
  tokenId?: string;
  targetId?: string;
  workflowType?: "swap_hr_decision";
}

export interface CreateActionTokenInput {
  workflowType: "swap_hr_decision";
  targetId: string;
  expiresInMinutes: number;
}

export interface ConsumeActionTokenInput {
  token: string;
  action: "approve" | "decline";
  actorEmail?: string;
}
