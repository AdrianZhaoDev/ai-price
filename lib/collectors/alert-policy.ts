export const COLLECTION_ALERT_CONSECUTIVE_SCHEDULED_FAILURES = 2;
export const COLLECTION_ALERT_OPEN_ERROR_HOURS = 8;

type CollectionAlertPolicyInput = {
  alreadyAlerted: boolean;
  consecutiveScheduledFailures: number;
  oldestOpenErrorAt: Date | null;
  now: Date;
};

export function shouldEscalateCollectionFailure(
  input: CollectionAlertPolicyInput,
): boolean {
  if (input.alreadyAlerted) return false;
  if (
    input.consecutiveScheduledFailures >=
    COLLECTION_ALERT_CONSECUTIVE_SCHEDULED_FAILURES
  ) {
    return true;
  }
  if (!input.oldestOpenErrorAt) return false;

  const openDurationMs =
    input.now.getTime() - input.oldestOpenErrorAt.getTime();
  return openDurationMs >= COLLECTION_ALERT_OPEN_ERROR_HOURS * 60 * 60 * 1_000;
}
