import { notFound } from "next/navigation";
import ShopSection from "@/components/shopsite/ShopSection";
import ShopContactCard from "@/components/shopsite/ShopContactCard";
import ShopRichContentRenderer from "@/components/shopsite/ShopRichContentRenderer";
import { fetchPublicShop, getShopCanonicalUrl } from "@/services/shopPublic.service";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return { alternates: { canonical: await getShopCanonicalUrl(slug, "gioi-thieu") } };
}

export default async function ShopTenantAboutPage({ params }) {
  const { slug } = await params;
  const shop = await fetchPublicShop(slug);
  if (!shop) notFound();

  const intro = shop.introHtml || "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      <div className="lg:col-span-8 space-y-3">
        <ShopSection title="Giới thiệu" bodyClassName="!p-0">
          {shop.cover && (
            <div className="relative aspect-[16/6] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shop.cover}
                alt={`Cửa hàng ${shop.name}`}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"
              />
            </div>
          )}

          <div className="px-4 sm:px-6 py-5">
            <ShopRichContentRenderer html={intro} />
          </div>
        </ShopSection>

        <ShopSection title="Thống kê shop">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox
              value={
                shop.productCount != null
                  ? Number(shop.productCount).toLocaleString("vi-VN")
                  : "—"
              }
              label="Sản phẩm"
            />
            <StatBox value={`${joinYears(shop)}`} label="Kinh nghiệm" />
            <StatBox value={shop.verified ? "Đã xác minh" : "Đang hoạt động"} label="Trạng thái" />
            <StatBox value={shop.province || "—"} label="Khu vực" />
          </div>
        </ShopSection>
      </div>

      <aside className="lg:col-span-4">
        <ShopContactCard shop={toContactShape(shop)} />
      </aside>
    </div>
  );
}

function StatBox({ value, label }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-4 text-center">
      <div className="text-xl sm:text-2xl font-extrabold text-[#e60012]">
        {value}
      </div>
      <div className="text-xs text-gray-600 mt-1">{label}</div>
    </div>
  );
}

function joinYears(shop) {
  if (!shop.createdAt) return "—";
  const created = new Date(shop.createdAt);
  if (Number.isNaN(created.getTime())) return "—";
  const years = Math.max(
    1,
    new Date().getFullYear() - created.getFullYear(),
  );
  return `${years}+ năm`;
}

function toContactShape(shop) {
  return {
    phone: shop.phone || "Liên hệ",
    zalo: shop.zalo || shop.phone || "Liên hệ",
    facebook: shop.facebook || { label: "Facebook", url: "#" },
    email: shop.email || "",
    address: shop.address || "Đang cập nhật",
    workingHoursLines:
      Array.isArray(shop.workingHoursLines) && shop.workingHoursLines.length > 0
        ? shop.workingHoursLines
        : ["Liên hệ shop để biết giờ làm việc"],
  };
}
