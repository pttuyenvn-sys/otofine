import ShopSection from "@/components/shopsite/ShopSection";
import ShopContactCard from "@/components/shopsite/ShopContactCard";
import { shopDemo } from "@/data/shop-demo";

export const metadata = {
  title: `Giới thiệu — ${shopDemo.name} | Otofine`,
  description: shopDemo.intro,
};

export default function ShopDemoAboutPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      <div className="lg:col-span-8 space-y-3">
        <ShopSection title="Giới thiệu" bodyClassName="!p-0">
          <div className="relative aspect-[16/6] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shopDemo.cover}
              alt={`Cửa hàng ${shopDemo.name}`}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"
            />
          </div>

          <article
            className="prose prose-sm sm:prose-base max-w-none px-4 sm:px-6 py-5 text-gray-800 leading-relaxed space-y-3 [&_h3]:text-[#e60012] [&_h3]:font-bold [&_h3]:mt-5 [&_h3]:text-lg [&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-2"
            dangerouslySetInnerHTML={{ __html: shopDemo.introHtml }}
          />
        </ShopSection>

        <ShopSection title="Thống kê shop">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox value={shopDemo.productCount.toLocaleString("vi-VN")} label="Sản phẩm" />
            <StatBox value={`${shopDemo.experienceYears}+ năm`} label="Kinh nghiệm" />
            <StatBox value={shopDemo.customerCount} label="Khách hàng" />
            <StatBox value={`${shopDemo.rating}★`} label={`${shopDemo.ratingCount} đánh giá`} />
          </div>
        </ShopSection>
      </div>

      <aside className="lg:col-span-4">
        <ShopContactCard shop={shopDemo} />
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
