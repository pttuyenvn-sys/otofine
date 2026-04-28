# Jobs — SEO cache (hạ tầng)

- **Warm / refresh hàng loạt:** gọi API public route (sau khi deploy) hoặc `POST /api/seo/refresh` theo từng slug.
- **Cron:** với 500k+ URL, dùng queue (BullMQ, SQS…) gọi refresh theo batch, **không** chạy LLM trong HTTP request — hiện tại engine là **template + KB** (nhanh, tái tạo an toàn).
- **Nâng cấp:** cắm bước `composeWithLlm(articleDraft)` chạy batch ngoài giờ, ghi lại JSON cache (DB hoặc object storage).
