/**
 * Giá trị mặc định ranking / typo — override bằng ENV trong `productSearch.service.js`.
 *
 * ENV thường dùng (production):
 * - TYPESENSE_QUERY_BY_WEIGHTS   ví dụ "20,3,1" (partNumber, partName, search_blob)
 * - TYPESENSE_NUM_TYPOS          0 | 1 | 2
 * - TYPESENSE_PRIORITIZE_EXACT   "0" để tắt exact-match boost
 * - TYPESENSE_TYPO_TOLERANCE     "off" để tắt typo hoàn toàn
 * - TYPESENSE_TYPO_TOLERANCE_JSON  JSON object theo API Typesense `typo_tolerance`
 * - TYPESENSE_PRIORITIZE_TOKEN_POSITION  "1" để bật prioritize_token_position
 */

export const TYPESENSE_SEARCH_DEFAULTS = {
  /** Trọng số query_by: partNumber cao nhất */
  query_by_weights: "20,3,1",
  /** Ưu tiên khớp chính xác token (boost) */
  prioritize_exact_match: true,
  /** Số typo cho toàn bộ query (0–2). ENV: TYPESENSE_NUM_TYPOS */
  num_typos: 1,
  /** Khi true và không có JSON override, gửi object typo_tolerance rõ ràng thay vì boolean */
  typo_tolerance_enabled: true,
  /**
   * Cấu hình typo mặc định (Typesense chấp nhận object hoặc boolean).
   * Override hoàn toàn: TYPESENSE_TYPO_TOLERANCE_JSON='{"enabled":false,...}'
   */
  typo_tolerance: {
    enabled: true,
    min_word_length_for_1_typo: 4,
    min_word_length_for_2_typos: 8,
  },
};
