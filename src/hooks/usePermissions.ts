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
  // Sees every page and candidate like HR Admin (minus salary) but can't
  // change anything — the server refuses every write (server/auth.ts).
  const isReadOnly = role === 'READ_ONLY';

  return {
    role,
    isHrAdmin,
    isUserManager,
    isDirector,
    isFinanceDirector,
    isApprovalRole,
    isRestrictedScreeningRole,
    isReadOnly,
    // Hide every create/edit/delete/send/upload control when false.
    canEdit: !isReadOnly,
    // Reference-check evaluations are visible to HR Admin (who fills them)
    // and to Director/Finance Director (who review them, read-only).
    canSeeReferenceCheck: isHrAdmin || isApprovalRole || isReadOnly,
    // AI/n8n-webhook analysis actions are HR-operational, hidden from
    // User Manager and from Director/Finance Director (approval-only roles).
    canRunAiAnalysis: !isUserManager && !isApprovalRole && !isReadOnly,
    // Assigning/unassigning reviewers is HR Admin only.
    canAssignReviewers: isHrAdmin,
    canApproveAsDirector: isDirector,
    canApproveAsFinanceDirector: isFinanceDirector,
    hideSalary: isUserManager || isReadOnly,
  };
}
