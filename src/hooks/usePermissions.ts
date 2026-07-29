import { useAuth } from '../contexts/AuthContext';

/**
 * Centralized RBAC flags derived from the current user's profile.role.
 * Add new named permissions here instead of re-deriving role comparisons
 * inline in page/component files.
 */
export function usePermissions() {
  const { profile } = useAuth();
  const role = profile?.role;

  const isHrAdmin = role === 'HR_ADMIN';
  const isUserManager = role === 'USER_MANAGER';
  const isDirector = role === 'DIRECTOR';
  const isFinanceDirector = role === 'FINANCE_DIRECTOR';
  const isApprovalRole = isDirector || isFinanceDirector;
  const isRestrictedScreeningRole = isUserManager || isApprovalRole;

  return {
    role,
    isHrAdmin,
    isUserManager,
    isDirector,
    isFinanceDirector,
    isApprovalRole,
    isRestrictedScreeningRole,
    // Reference-check evaluations are visible to HR Admin (who fills them)
    // and to Director/Finance Director (who review them, read-only).
    canSeeReferenceCheck: isHrAdmin || isApprovalRole,
    // AI/n8n-webhook analysis actions are HR-operational, hidden from
    // User Manager and from Director/Finance Director (approval-only roles).
    canRunAiAnalysis: !isUserManager && !isApprovalRole,
    // Assigning/unassigning reviewers is HR Admin only.
    canAssignReviewers: isHrAdmin,
    canApproveAsDirector: isDirector,
    canApproveAsFinanceDirector: isFinanceDirector,
    hideSalary: isUserManager,
  };
}
