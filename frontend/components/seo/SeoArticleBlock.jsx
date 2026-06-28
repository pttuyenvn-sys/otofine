"use client";

import { useMemo } from "react";
import Link from "next/link";
import { API_ORIGIN } from "@/lib/config";
import { getProductDetailHref } from "@/lib/productDetailHref";
import { SEO_BASE_SLUG } from "@/lib/seo/slugify";
import { enhanceSeoArticleHtml } from "./seoArticleBodyEnhance";
import "./seo-article-card.css";
import "./seo-article-block-shell.css";

/**
 * Strip HTML for plain-text display (titles, shop names).
 */
function stripHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function formatMoney(v) {
  if (v === null || v === undefined || v === "") return "Liên hệ";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${n.toLocaleString("vi-VN")} ₫`;
}

function resolveImg(u) {
  if (!u) return "";
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) return `${API_ORIGIN}${s}`;
  return `${API_ORIGIN}/${s}`;
}

function shopBrowseHref(s) {
  const name = stripHtml(String(s?.name ?? "")).trim();
  return name
    ? `/${SEO_BASE_SLUG}?q=${encodeURIComponent(name)}`
    : `/${SEO_BASE_SLUG}`;
}

function faqHasContent(faq) {
  if (!faq?.kind) return false;
  if (faq.kind === "list") return Array.isArray(faq.items) && faq.items.length > 0;
  if (faq.kind === "textLines")
    return Array.isArray(faq.lines) && faq.lines.length > 0;
  if (faq.kind === "json") return faq.payload != null;
  return false;
}

function buildVehicleLabel(ctx) {
  const { brand, model, year, vehicleLabel } = ctx || {};
  const label = [brand, model, year].filter(Boolean).join(" ").trim();
  return label || String(vehicleLabel ?? "").trim();
}

function foldVi(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectPartProfile(partLabel, context) {
  const hay = foldVi([
    partLabel,
    context?.partName,
    context?.baseSlug,
    context?.displayName,
  ].filter(Boolean).join(" "));

  if (/\b(phanh|brake|ma phanh|dia phanh|heo phanh|caliper|abs)\b/.test(hay)) {
    return "brake";
  }
  if (/\b(lai|thuoc lai|rotuyn|rotuyn|ro tuyn|vo lang|steering)\b/.test(hay)) {
    return "steering";
  }
  if (/\b(den|dien|cam bien|ecu|mobin|bugi|may phat|de|starter|electrical)\b/.test(hay)) {
    return "electrical";
  }
  if (/\b(cang|bamper|bumper|nap capo|guong|canh cua|than vo|body|vo xe)\b/.test(hay)) {
    return "body";
  }
  return "default";
}

function JsonLd({ data }) {
  if (!data) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

function buildTechnicalInfoItems(partLabel, context) {
  const profile = detectPartProfile(partLabel, context);
  const vehicle = buildVehicleLabel(context);
  const basePart = stripHtml(String(context?.partName || partLabel || "phụ tùng"));
  const subject = vehicle ? `${basePart} ${vehicle}` : basePart;
  const vehicleTail = vehicle
    ? ` Trên ${vehicle}, cần đối chiếu thêm đời xe, phiên bản động cơ và vị trí lắp trước khi đặt hàng.`
    : "";

  const profiles = {
    steering: [
      {
        q: "Những lưu ý quan trọng",
        a: `${subject} liên quan trực tiếp tới độ rơ lái, độ ổn định thân xe và an toàn khi chuyển hướng. Khi có tiếng kêu, lệch lái hoặc vô lăng trả lái bất thường, nên kiểm tra đồng thời rotuyn, thước lái, cao su càng và góc đặt bánh xe.${vehicleTail}`,
      },
      {
        q: `Dấu hiệu cần kiểm tra ${basePart}`,
        a: `Các dấu hiệu đáng chú ý gồm vô lăng rung, xe nhao lái, tiếng lục cục khi qua ổ gà hoặc cảm giác lái không đều hai bên. Không nên thay riêng một chi tiết nếu chưa kiểm tra cụm liên kết lái vì lỗi có thể nằm ở nhiều điểm chịu tải.`,
      },
      {
        q: `Lưu ý khi chọn mua ${subject}`,
        a: `Ưu tiên sản phẩm đúng mã, đúng vị trí trái/phải và có ảnh chi tiết đầu nối, ren, cao su bụi. Với hệ thống lái, chênh lệch nhỏ về kích thước hoặc đầu bắt có thể làm khó cân chỉnh sau lắp.`,
      },
    ],
    brake: [
      {
        q: "Những lưu ý quan trọng",
        a: `${subject} ảnh hưởng trực tiếp tới quãng đường phanh và độ ổn định khi dừng xe. Nếu mòn lệch, phát tiếng rít hoặc phanh rung, cần kiểm tra cả đĩa phanh, heo phanh, chốt trượt và dầu phanh thay vì chỉ thay một món riêng lẻ.${vehicleTail}`,
      },
      {
        q: `Dấu hiệu cần kiểm tra ${basePart}`,
        a: `Các dấu hiệu thường gặp gồm bàn đạp phanh sâu, xe lệch khi phanh, rung vô lăng hoặc bề mặt má/đĩa mòn không đều. Những biểu hiện này có thể đến từ cụm phanh hoặc lốp, nên cần kiểm tra thực tế trước khi kết luận.`,
      },
      {
        q: `Lưu ý khi chọn mua ${subject}`,
        a: `Cần chọn đúng cầu trước/sau, đời xe và thông số kích thước. Nên ưu tiên sản phẩm có mã rõ, ảnh thật và chính sách đổi trả nếu kiểm tra không đúng xe.`,
      },
    ],
    body: [
      {
        q: "Những lưu ý quan trọng",
        a: `${subject} cần khớp form thân vỏ, vị trí pát bắt và đời xe. Chỉ cần khác phiên bản hoặc năm sản xuất, chi tiết có thể không ăn khớp, hở khe hoặc lệch đường gân sau khi lắp.${vehicleTail}`,
      },
      {
        q: `Dấu hiệu cần kiểm tra ${basePart}`,
        a: `Nên kiểm tra vết nứt, móp, cong pát, sai màu hoặc lệch khe hở với các chi tiết liền kề. Với phụ tùng thân vỏ, ảnh chụp nhiều góc giúp giảm rủi ro mua nhầm biến thể.`,
      },
      {
        q: `Lưu ý khi chọn mua ${subject}`,
        a: `Cần xác nhận đúng đời xe, bản facelift, vị trí trái/phải và tình trạng sơn. Không nên chỉ dựa vào tên gọi chung vì cùng một dòng xe có thể có nhiều form khác nhau.`,
      },
    ],
    electrical: [
      {
        q: "Những lưu ý quan trọng",
        a: `${subject} cần đúng giắc cắm, điện áp, mã điều khiển và cấu hình theo xe. Lỗi điện có thể do dây dẫn, cầu chì, cảm biến liên quan hoặc hộp điều khiển, nên cần kiểm tra mạch trước khi thay.${vehicleTail}`,
      },
      {
        q: `Dấu hiệu cần kiểm tra ${basePart}`,
        a: `Các dấu hiệu thường gặp gồm đèn báo lỗi, hoạt động chập chờn, mất tín hiệu hoặc lỗi xuất hiện theo nhiệt độ/rung động. Nên quét lỗi và kiểm tra nguồn mass để tránh thay nhầm chi tiết.`,
      },
      {
        q: `Lưu ý khi chọn mua ${subject}`,
        a: `Ưu tiên sản phẩm có mã OE/OEM, ảnh giắc cắm rõ và cam kết tương thích. Với phụ tùng điện, khác mã nhỏ có thể khiến xe báo lỗi hoặc không nhận thiết bị.`,
      },
    ],
    default: [
      {
        q: "Những lưu ý quan trọng",
        a: `${subject} cần được chọn theo đúng mã phụ tùng, vị trí lắp và điều kiện sử dụng thực tế. Không nên chỉ dựa vào tên gọi chung vì cùng một tên có thể có nhiều biến thể theo đời xe.${vehicleTail}`,
      },
      {
        q: `Dấu hiệu cần kiểm tra ${basePart}`,
        a: `Nên kiểm tra tiếng kêu, độ rơ, rò rỉ, nứt vỡ hoặc sai lệch khi vận hành. Nếu triệu chứng liên quan tới nhiều hệ thống, cần kiểm tra cụm liên quan trước khi quyết định thay.`,
      },
      {
        q: `Lưu ý khi chọn mua ${subject}`,
        a: `Nên chuẩn bị ảnh phụ tùng cũ, mã in trên chi tiết hoặc số VIN để cửa hàng đối chiếu. Ưu tiên sản phẩm có ảnh thật, thông tin giá rõ và chính sách đổi trả khi không đúng xe.`,
      },
    ],
  };

  return profiles[profile] || profiles.default;
}

function faqItemsFromStructured(faq, partLabel, context) {
  if (!faq?.kind) return [];
  if (faq.kind === "list" && Array.isArray(faq.items)) {
    return faq.items
      .map((row) => {
        if (row && typeof row === "object") {
          return {
            q: stripHtml(String(row.q || row.question || "")),
            a: stripHtml(String(row.a || row.answer || "")),
          };
        }
        return {
          q: "Những lưu ý quan trọng",
          a: stripHtml(String(row ?? "")),
        };
      })
      .filter((row) => row.q && row.a);
  }
  if (faq.kind === "textLines" && Array.isArray(faq.lines)) {
    return buildTechnicalInfoItems(partLabel, context);
  }
  return [];
}

function buildContextFaqItems(partLabel, context) {
  const vehicle = buildVehicleLabel(context);
  const location = String(context?.location ?? "").trim();
  const basePart = stripHtml(String(context?.partName || partLabel || "Phụ tùng"));
  const subject = vehicle ? `${basePart} ${vehicle}` : basePart;
  const items = [];

  if (vehicle) {
    items.push({
      q: `${subject} có dùng chung với đời xe khác không?`,
      a: `${subject} cần được đối chiếu theo mã phụ tùng, đời xe và phiên bản động cơ. Không nên chỉ dựa vào tên gọi chung vì cùng một dòng xe có thể có nhiều biến thể lắp đặt.`,
    });
    items.push({
      q: `Làm sao chọn đúng ${subject}?`,
      a: `Nên chuẩn bị mã trên phụ tùng cũ, số VIN hoặc ảnh chi tiết đang lắp để cửa hàng kiểm tra tương thích trước khi mua.`,
    });
  }

  if (location) {
    items.push({
      q: `Mua ${subject} tại ${location} cần lưu ý gì?`,
      a: `Ưu tiên shop có hàng sẵn tại ${location}, ảnh sản phẩm rõ ràng, mã hàng đầy đủ và chính sách đổi trả nếu kiểm tra không đúng xe.`,
    });
  }

  return items;
}

function mergeFaq(faq, partLabel, context) {
  const seen = new Set();
  const items = [];
  for (const row of [
    ...buildContextFaqItems(partLabel, context),
    ...faqItemsFromStructured(faq, partLabel, context),
  ]) {
    const key = `${row.q} ${row.a}`.toLowerCase();
    if (!row.q || !row.a || seen.has(key)) continue;
    seen.add(key);
    items.push(row);
    if (items.length >= 8) break;
  }
  return items.length ? { kind: "list", items } : faq;
}

function faqJsonLd(faq) {
  const items = faqItemsFromStructured(faq);
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((row) => ({
      "@type": "Question",
      name: row.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: row.a,
      },
    })),
  };
}

/**
 * SEO article block — part-knowledge routes (inside Home column). Homepage grid unchanged.
 *
 * @param {{
 *   intro?: string,
 *   article?: string,
 *   shops?: unknown[],
 *   faq?: unknown,
 *   relatedLinks?: unknown,
 *   products?: unknown[],
 *   imageProducts?: unknown[],
 *   productThumbnails?: Record<string, string>,
 *   partDisplayName?: string,
 *   context?: object,
 * }} props
 */
export default function SeoArticleBlock({
  intro = "",
  article = "",
  shops = [],
  faq = null,
  relatedLinks = null,
  products = [],
  imageProducts = [],
  productThumbnails = {},
  partDisplayName = "Phụ tùng",
  context = null,
}) {
  const introHtml = String(intro ?? "");
  const articleHtml = String(article ?? "");
  const shopList = Array.isArray(shops) ? shops : [];
  const productList = Array.isArray(products) ? products : [];
  const imageProductList = Array.isArray(imageProducts) ? imageProducts : [];

  const cross =
    relatedLinks == null
      ? null
      : Array.isArray(relatedLinks)
        ? relatedLinks
        : relatedLinks &&
          typeof relatedLinks === "object" &&
          Array.isArray(relatedLinks.items)
          ? relatedLinks.items
          : [];
  const relatedItems = Array.isArray(cross)
    ? cross
      .map((x, idx) => {
        const slugPart =
          typeof x?.slug === "string"
            ? x.slug
            : typeof x?.slug_vi === "string"
              ? x.slug_vi
              : typeof x?.href === "string"
                ? x.href.replace(/^\//, "")
                : null;
        if (!slugPart) return null;
        const label =
          x?.name ||
          x?.title ||
          x?.name_vi ||
          x?.label ||
          slugPart;
        const href =
          typeof x?.href === "string" && x.href.startsWith("/")
            ? x.href
            : `/${String(slugPart).replace(/^\//, "")}`;
        return {
          key: `rel-${idx}-${slugPart}`,
          href,
          label: stripHtml(String(label)),
        };
      })
      .filter((item) => item?.href && item?.label)
    : [];

  const partLabel =
    stripHtml(String(partDisplayName || "Phụ tùng")) || "Phụ tùng";
  const shopLabel = [
    stripHtml(String(context?.partName || partLabel)),
    context?.brand,
    context?.model,
  ]
    .filter(Boolean)
    .join(" ");
  const enhancedFaq = useMemo(
    () => mergeFaq(faq, partLabel, context),
    [faq, partLabel, context],
  );
  const faqLd = useMemo(() => faqJsonLd(enhancedFaq), [enhancedFaq]);
  const showShopBlock = Boolean(context?.location) && shopList.length > 0;
  const showBottomCard =
    showShopBlock ||
    faqHasContent(enhancedFaq) ||
    relatedItems.length > 0;

  const richArticleHtml = useMemo(
    () =>
      enhanceSeoArticleHtml(articleHtml, {
        products: productList,
        imageProducts: imageProductList,
        productThumbnails,
        resolveImg,
        partDisplayName: partLabel,
        shopDisplayName: shopLabel,
        vehicleLabel: context?.vehicleLabel,
        getProductDetailHref,
        formatMoney,
      }),
    [articleHtml, productList, imageProductList, productThumbnails, partLabel, shopLabel, context?.vehicleLabel],
  );

  return (
    <div className="seo-ab-root">
      {faqLd ? <JsonLd data={faqLd} /> : null}
      {introHtml.trim() ? (
        <div
          className="seo-ab-hero-intro"
          dangerouslySetInnerHTML={{ __html: introHtml }}
        />
      ) : null}

      {richArticleHtml.trim() ? (
        <section className="seo-ab-unified-card" aria-label="Nội dung tư vấn">
          <article
            className="seo-article-content"
            itemScope
            itemType="https://schema.org/Article"
            dangerouslySetInnerHTML={{ __html: richArticleHtml }}
          />
        </section>
      ) : null}

      {showBottomCard ? (
        <section className="seo-bc-card" aria-label="Cửa hàng và liên quan">
          {showShopBlock ? (
            <div className="seo-bc-section seo-bc-section--shops">
              <h2 className="seo-bc-heading">
                Cửa hàng tại {stripHtml(String(context.location))}
              </h2>
              <ul className="seo-bc-shop-list">
                {shopList.map((s) => {
                  const sid = s?.id;
                  const name = stripHtml(
                    String(s?.name ?? `Cửa hàng #${sid ?? ""}`),
                  );
                  const phone = s?.phone ? stripHtml(String(s.phone)) : "";
                  const count = Number.isFinite(Number(s?.total_products))
                    ? Number(s.total_products)
                    : null;
                  const city = stripHtml(String(s?.city ?? context.location ?? ""));

                  return (
                    <li key={sid ?? name}>
                      <div className="seo-bc-shop-layout">
                        <div className="seo-bc-shop-left">
                          <div className="seo-bc-shop-name">{name}</div>
                          <div className="seo-bc-shop-meta">
                            {[city, count != null ? `${count.toLocaleString("vi-VN")} sản phẩm` : ""]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                          {phone ? (
                            <a
                              className="seo-bc-shop-phone"
                              href={`tel:${String(s.phone).replace(/\D/g, "")}`}
                            >
                              {phone}
                            </a>
                          ) : (
                            <span className="seo-bc-shop-phone-muted">
                              —
                            </span>
                          )}
                        </div>
                        <div className="seo-bc-shop-actions">
                          <Link
                            href={shopBrowseHref(s)}
                            className="seo-bc-shop-btn" prefetch={false}>
                            View shop
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {faqHasContent(enhancedFaq) ? (
            <div className="seo-bc-section">
              <h2 className="seo-bc-heading">Câu hỏi thường gặp</h2>
              <FaqAccordion faq={enhancedFaq} />
            </div>
          ) : null}

          {relatedItems.length > 0 ? (
            <div className="seo-bc-section">
              <h2 className="seo-bc-heading">Bài viết liên quan</h2>
              <ul className="seo-bc-related-grid">
                {relatedItems.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} prefetch={false}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function FaqAccordion({ faq }) {
  if (!faq?.kind) return null;
  if (faq.kind === "list" && Array.isArray(faq.items)) {
    return (
      <div className="seo-bc-faq-accordion">
        {faq.items.map((row, i) => {
          if (row && typeof row === "object" && ("q" in row || "a" in row)) {
            const q = stripHtml(String(row.q || row.question || "?"));
            const a = stripHtml(String(row.a || row.answer || ""));
            return (
              <details key={i} className="seo-bc-faq-item">
                <summary>{q}</summary>
                <div className="seo-bc-faq-answer">{a}</div>
              </details>
            );
          }
          return (
            <details key={i} className="seo-bc-faq-item">
              <summary>Những lưu ý quan trọng</summary>
              <div className="seo-bc-faq-answer">{stripHtml(String(row))}</div>
            </details>
          );
        })}
      </div>
    );
  }
  if (faq.kind === "json" && faq.payload) {
    return (
      <pre className="seo-ab-faq-pre">
        {JSON.stringify(faq.payload, null, 2)}
      </pre>
    );
  }
  if (faq.kind === "textLines" && Array.isArray(faq.lines)) {
    const labels = [
      "Những lưu ý quan trọng",
      "Dấu hiệu cần kiểm tra",
      "Lưu ý khi chọn mua",
    ];
    return (
      <div className="seo-bc-faq-accordion">
        {faq.lines.map((line, idx) => (
          <details key={idx} className="seo-bc-faq-item">
            <summary>{labels[idx] || "Thông tin cần biết khi chọn phụ tùng"}</summary>
            <div className="seo-bc-faq-answer">{stripHtml(String(line))}</div>
          </details>
        ))}
      </div>
    );
  }
  return null;
}
