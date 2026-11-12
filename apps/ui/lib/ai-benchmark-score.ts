/**
 * Shared names of the per-service AI tasks (mirrors the server's `BenchTask`)
 * and the accuracy bar a service must reach. Scores come from the evaluation
 * benchmark (`/admin/ai-eval`).
 */

/** Below this accuracy a service is not used where a good score is required (playground grammar). Same as the server. */
export const MIN_ACCURACY = 75;

/** The jobs scored separately; each has its own priority order. */
export type BenchTask = "translate" | "write" | "grammar" | "pronounce" | "verify";
export const TASK_LABELS: Record<BenchTask, string> = { translate: "Dịch", write: "Đặt câu", grammar: "Phân tích ngữ pháp", pronounce: "Kiểm tra từ vựng", verify: "Kiểm tra từ vựng" };
