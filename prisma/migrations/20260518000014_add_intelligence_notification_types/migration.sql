-- Sprint 12: Add intelligence alerting NotificationType enum values

ALTER TYPE "NotificationType" ADD VALUE 'CONTINUITY_STATE_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'ARCHETYPE_TRANSITION';
ALTER TYPE "NotificationType" ADD VALUE 'INTERVENTION_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE 'RISK_ESCALATED';
