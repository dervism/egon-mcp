/**
 * Closes every client and server, even when one of them fails, then reports
 * the first failure. Missing ones (setup failed before creating them) are skipped.
 */
export async function closeAll(...closables: ({ close(): Promise<void> } | undefined)[]): Promise<void> {
  // async turns a close() that throws at once into a rejection, so the others still run.
  const closed = await Promise.allSettled(closables.map(async (closable) => closable?.close()));
  const failure = closed.find((result) => result.status === 'rejected');
  if (failure) {
    throw failure.reason;
  }
}
