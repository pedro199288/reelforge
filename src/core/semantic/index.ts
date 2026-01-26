/**
 * Semantic cut detection based on script sentences
 *
 * Alternative to silence-based cutting:
 * - Silence within a sentence = natural pause (keep)
 * - Silence between sentences = candidate for cutting
 */

export * from "./types";
export * from "./sentence-boundaries";
export * from "./segments";
