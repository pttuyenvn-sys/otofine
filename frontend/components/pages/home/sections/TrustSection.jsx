import React from "react";

export default function TrustSection() {
  return (
    <section
      className="of-trust-market"
      aria-labelledby="of-trust-market-h2"
    >
      <h2 id="of-trust-market-h2" className="of-trust-market__title">
        Tại sao chọn Otofine
      </h2>
      <ul className="of-trust-market__grid" role="list">
        {[
          {
            t: "✓ Shop đã xác minh",
            d: "Thông tin shop rõ ràng hơn",
          },
          {
            t: "✓ Hỗ trợ tìm đúng xe",
            d: "Lọc theo hãng, dòng, năm",
          },
          {
            t: "✓ Nhiều lựa chọn giá",
            d: "So sánh nhiều shop nhanh",
          },
          {
            t: "✓ Hỗ trợ tìm phụ tùng",
            d: "Có thể gửi VIN hoặc ảnh",
          },
        ].map((x) => (
          <li key={x.t} className="of-trust-market__item" role="listitem">
            <h3 className="of-trust-market__h3">{x.t}</h3>
            <p className="of-trust-market__p">{x.d}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

