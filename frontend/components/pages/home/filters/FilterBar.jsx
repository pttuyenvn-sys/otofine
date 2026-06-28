 "use client";
 import React from "react";
 import Link from "next/link";

 export default function FilterBar({
   sort,
   setSort,
   startTransition,
   setPage,
   cityDropdownRef,
   selectedCity,
   setCityDropdownOpen,
   cityDropdownOpen,
   availableLocations,
   onLocationSelect,
 }) {
   return (
     <div
       className="listing-sort"
       role="toolbar"
       aria-label="Sắp xếp danh sách"
       style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}
     >
       {[
         { id: "popular", label: "Phổ biến" },
         { id: "newest", label: "Mới nhất" },
         { id: "price_asc", label: "Giá ↑" },
         { id: "price_desc", label: "Giá ↓" },
       ].map((s) => (
         <button
           key={s.id}
           type="button"
           className={sort === s.id ? "listing-sort__btn is-active" : "listing-sort__btn"}
           aria-pressed={sort === s.id}
           onClick={() => {
             startTransition(() => {
               setSort(s.id);
               setPage(1);
             });
           }}
         >
           {s.label}
         </button>
       ))}
       <div ref={cityDropdownRef} style={{ position: "relative", marginLeft: "auto" }}>
         <button
           type="button"
           className={selectedCity ? "listing-sort__btn is-active" : "listing-sort__btn"}
           onClick={() => setCityDropdownOpen((v) => !v)}
           aria-haspopup="listbox"
           aria-expanded={cityDropdownOpen}
           style={{ minWidth: 90 }}
         >
           {selectedCity?.name ? selectedCity.name.replace(/^TP\s+/i, "") : "Địa điểm"}
           <span style={{ marginLeft: 4, fontSize: 10 }}>{cityDropdownOpen ? "▴" : "▾"}</span>
         </button>
         {cityDropdownOpen && (
           <ul
             role="listbox"
             style={{
               position: "absolute",
               right: 0,
               top: "calc(100% + 4px)",
               background: "#fff",
               border: "1px solid #e2e8f0",
               borderRadius: 10,
               boxShadow: "0 4px 16px rgba(0,0,0,.1)",
               padding: "6px 0",
               margin: 0,
               listStyle: "none",
               zIndex: 50,
               minWidth: 200,
               maxHeight: 320,
               overflowY: "auto",
             }}
           >
             <li
               role="option"
               aria-selected={!selectedCity}
               style={{
                 padding: "8px 14px",
                 cursor: "pointer",
                 fontSize: 13,
                 fontWeight: !selectedCity ? 700 : 400,
                 color: !selectedCity ? "#e85d1a" : "#1f2937",
                 background: !selectedCity ? "#fff7f0" : "transparent",
               }}
               onClick={() => {
                 onLocationSelect(null);
                 setCityDropdownOpen(false);
               }}
             >
               Toàn quốc
             </li>
             {(() => {
              const sorted = [...(availableLocations || [])].sort((a, b) => {
                 if (selectedCity?.id === a.id) return -1;
                 if (selectedCity?.id === b.id) return 1;
                 return b.productCount - a.productCount;
               });
               return sorted.map((loc) => {
                 const isActive = selectedCity?.id === loc.id;
                 return (
                   <li
                     key={loc.id}
                     role="option"
                     aria-selected={isActive}
                     style={{
                       padding: "8px 14px",
                       cursor: "pointer",
                       fontSize: 13,
                       fontWeight: isActive ? 700 : 400,
                       color: isActive ? "#e85d1a" : "#1f2937",
                       background: isActive ? "#fff7f0" : "transparent",
                       display: "flex",
                       justifyContent: "space-between",
                       gap: 8,
                     }}
                     onClick={() => {
                       onLocationSelect(loc);
                       setCityDropdownOpen(false);
                     }}
                   >
                     <span>{loc.name.replace(/^TP\s+/i, "")}</span>
                     <span>{loc.productCount}</span>
                   </li>
                 );
               });
             })()}
           </ul>
         )}
       </div>
     </div>
   );
 }

