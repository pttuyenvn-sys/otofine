# RFQ Closed Beta — UX QA & readiness

Deliverables aligned with polish sprint: inbox, quick quote, buyer token page, mobile, copy.

## 1. Seller inbox (`/rfq/shop/inbox`)

- [ ] **Unread**: viền trái xanh + badge “Chưa đọc” rõ trên mobile.
- [ ] **SLA**: nhãn cam/đỏ cho gần hết hạn / trễ; card có viền cảnh báo khi khẩn.
- [ ] **Primary CTA**: “Báo giá ngay” to, đủ vùng chạm (~48px cao).
- [ ] **Sticky toolbar**: chip filter + sort dính đầu viewport khi cuộn (Safari/Chrome).
- [ ] **Skeleton**: hiển thị khi tải lần đầu / đổi filter; không nháy layout.

## 2. Quick quote (`/rfq/shop/[dispatchId]#rq-quote`)

- [ ] **Focus**: ô giá được focus sau khi load (chưa báo giá).
- [ ] **Keyboard**: `inputMode`/`enterKeyHint` hợp lý trên iOS/Android.
- [ ] **Ghi chú**: `details` đóng mặc định — form gọn.
- [ ] **Submit**: spinner + disable double-submit; banner xanh sau khi gửi thành công.
- [ ] **Sticky bar**: khi chưa báo giá, bar dưới màn hình + nút nhảy `#rq-quote`.
- [ ] **Safe area**: không che nút trên iPhone (home indicator).

## 3. Buyer token (`/rfq/t/[token]`)

- [ ] **Skeleton** trong lúc fetch.
- [ ] **Hero**: headline/sub theo trạng thái (đang kết nối / đã có báo giá / hết hạn / huỷ).
- [ ] **Timeline** bật khi không huỷ/hết hạn.
- [ ] **Quotes**: sort giá thấp → cao; badge “Giá thấp nhất” khi ≥2 báo giá.
- [ ] **Empty / waiting**: copy chờ báo giá rõ ràng.
- [ ] **Ảnh**: thumbnail mở tab mới; URL ghép `NEXT_PUBLIC_API_ORIGIN` hoặc fallback internal.

## 4. RFQ status UX (buyer-side, không API mới)

- [ ] Map `open` / `dispatching` / `quoted` / `closed` / `expired` / `cancelled` hiển thị đúng pill + timeline.

## 5. Mobile optimization

- [ ] Touch targets chip/filter ≥ ~44px.
- [ ] Cards không tràn ngang; snippet 2 dòng ellipsis.
- [ ] Cuộn tới form báo giá không bị header che (`scroll-margin`).

## 6. Slow network / image upload

- [ ] Inbox & token: không treo UI — skeleton / nút disabled có nhãn.
- [ ] `/rfq/new` upload (ngoài scope file này): thử 3G throttle trong DevTools.

## 7. Desktop sanity

- [ ] Layout seller wide (`max-width`); buyer column hẹp đọc dễ.

## Closed beta readiness notes

- Copy nhấn **realtime / web trước Zalo** — đồng bộ với ops escalation.
- Buyer CTR notification vẫn phụ thuộc backend/events; UI chỉ hiển thị trạng thái từ payload hiện có.
- QA devices tối thiểu: **iPhone Safari**, **Android Chrome**, một desktop Chromium.
