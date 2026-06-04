 "use client";
 import React from "react";
 import Link from "next/link";

 export default function ListingHero({ pageTitle }) {
   return (
     <section
       className="listing-hero listing-hero--premium"
       aria-labelledby="listing-h1"
     >
       <div className="listing-hero__top">
         <div>
           <h1 id="listing-h1" className="listing-hero__h1">
             {pageTitle}
           </h1>
           <p className="listing-hero__sub">
             Tìm đúng phụ tùng theo xe, so sánh giá, liên hệ trực tiếp
             cửa hàng — minh bạch, nhanh chóng.
           </p>
         </div>
         <div className="listing-hero__cta-row">
           <a
             href="#otofine-products-start"
             className="listing-hero__cta listing-hero__cta--buyer"
           >
             Mua phụ tùng
           </a>
           <Link
             href="/shop/register"
             className="listing-hero__cta listing-hero__cta--seller"
             prefetch={false}
           >
             Đăng ký bán
           </Link>
         </div>
       </div>
       <ul className="listing-hero__badges" role="list">
         <li role="listitem">Shop xác minh</li>
         <li role="listitem">Giá rõ ràng</li>
         <li role="listitem">Hỗ trợ tìm đúng xe</li>
         <li role="listitem">Tối ưu mobile</li>
       </ul>
     </section>
   );
 }

