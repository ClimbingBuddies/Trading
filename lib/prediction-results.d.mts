export function predictionStatus(prediction: unknown, result: {status: string} | null | undefined): string;
export function predictionScorecard(predictions: {id: string; action: string; horizon_sessions: number}[], results: {prediction_id: string; evaluated_at: string; status: string; net_return: number | string | null; benchmark_return: number | string | null}[], horizon: number): {published: number; completed: number; wins: number; compared: number; beatBenchmark: number; meanReturn: number | null};
export function formatPredictionReturn(value: number | string | null | undefined): string;

