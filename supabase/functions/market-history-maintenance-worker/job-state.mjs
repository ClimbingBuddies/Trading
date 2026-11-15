// A failed/ambiguous receipt write must not be followed by a contradictory retry.
export class JobStateUnconfirmed extends Error {}
export async function persistJobState(db, job, values) {
  try {
    const { data, error } = await db.from('market_history_jobs').update(values)
      .eq('id', job.id).eq('status', 'running').eq('attempts', job.attempts).select('id');
    if (error || !Array.isArray(data) || data.length !== 1 || data[0].id !== job.id) {
      throw new Error(error?.message ?? 'Claim no longer owns exactly one running job');
    }
  } catch (error) {
    throw new JobStateUnconfirmed('History job state unconfirmed: ' + String(error));
  }
}
