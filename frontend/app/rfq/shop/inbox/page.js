"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ShopInboxVehicleFilters from "@/components/rfq/ShopInboxVehicleFilters";
import RfqShopBuyerList from "@/components/rfq/RfqShopBuyerList";
import RfqShopInboxChatPane from "@/components/rfq/RfqShopInboxChatPane";
import { SHOP_INBOX_STATUS_FILTERS } from "@/lib/rfq/rfqInboxFilters";
import { useShopInboxList } from "@/hooks/useShopInboxList";
import {
  buildShopRfqConversationPath,
  parseShopDispatchId,
  SHOP_RFQ_INBOX_PATH,
} from "@/lib/rfq/rfqShopDeepLink";

function useInboxDesktopSplit() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

export default function RfqSellerInboxPage() {
  const router = useRouter();
  const loginRedirectRef = useRef(false);
  const deepLinkHandledRef = useRef(false);
  const [filter, setFilter] = useState("all");
  const [vehicleBrand, setVehicleBrand] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [categoryKey, setCategoryKey] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const isDesktop = useInboxDesktopSplit();

  const { items, loading, msg, hasMore, loadMore, loginBlocked, loginUrl } = useShopInboxList({
    filter,
    sort: "activity",
    vehicleBrand,
    vehicleModel,
    vehicleYear,
    categoryKey,
  });

  useEffect(() => {
    if (!isDesktop) {
      setSelectedId(null);
      return;
    }
    if (!items.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev != null && items.some((r) => Number(r.id) === Number(prev))) return prev;
      return items[0].id;
    });
  }, [items, isDesktop]);

  useEffect(() => {
    if (loginBlocked || !loginUrl || loginRedirectRef.current) return;
    loginRedirectRef.current = true;
    router.replace(loginUrl);
  }, [loginBlocked, loginUrl, router]);

  useEffect(() => {
    if (loginBlocked || deepLinkHandledRef.current || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const targetId = parseShopDispatchId(params.get("dispatchId"));
    if (!targetId) return;

    deepLinkHandledRef.current = true;

    if (!isDesktop) {
      router.replace(buildShopRfqConversationPath(targetId));
      return;
    }

    if (items.some((row) => Number(row.id) === targetId)) {
      setSelectedId(targetId);
    }
  }, [loginBlocked, isDesktop, items, router]);

  const handleSelect = useCallback((id) => {
    setSelectedId(id);
  }, []);

  const listPanel = (
    <>
      <header className="rfq-inbox-list-panel__head">
        <h1 className="rfq-inbox-list-panel__title">Inbox</h1>
        <span className="rfq-inbox-list-panel__count">{items.length}</span>
      </header>

      <div className="rfq-toolbar rfq-toolbar--sticky rfq-toolbar--inbox">
        <div className="rfq-chip-row rfq-chip-row--inbox">
          {SHOP_INBOX_STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`rfq-chip rfq-chip--inbox ${filter === f.id ? "rfq-chip--active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <ShopInboxVehicleFilters
          brand={vehicleBrand}
          model={vehicleModel}
          year={vehicleYear}
          categoryKey={categoryKey}
          onChange={({ brand, model, year, categoryKey: ck }) => {
            setVehicleBrand(brand || "");
            setVehicleModel(model || "");
            setVehicleYear(year || "");
            setCategoryKey(ck || "");
          }}
        />
      </div>

      {loginBlocked && loginUrl ? (
        <p className="rfq-banner-error rfq-inbox-list-panel__msg">
          Cần{" "}
          <Link href={loginUrl} className="rfq-auth-login-link">
            đăng nhập shop
          </Link>{" "}
          để xem inbox.
        </p>
      ) : msg ? (
        <p className="rfq-banner-error rfq-inbox-list-panel__msg">{msg}</p>
      ) : null}

      {loading && !items.length ? (
        <ul className="rfq-shop-buyer-list rfq-shop-buyer-list--page" aria-busy="true">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <li key={i} className="rfq-shop-buyer-list__row rfq-shop-buyer-list__row--skeleton">
              <div className="rfq-skel rfq-skel--line" />
              <div className="rfq-skel rfq-skel--line rfq-skel--short" />
            </li>
          ))}
        </ul>
      ) : (
        <RfqShopBuyerList
          items={items}
          variant="page"
          useLinks={!isDesktop}
          activeDispatchId={isDesktop ? selectedId : null}
          onSelect={isDesktop ? handleSelect : undefined}
        />
      )}

      {!loading && !items.length && !msg ? (
        <p className="rfq-shop-buyer-list__empty muted">Không có RFQ ở bộ lọc này</p>
      ) : null}

      {hasMore ? (
        <div className="rfq-load-more-wrap">
          <button type="button" className="rfq-btn rfq-btn--secondary rfq-btn--sm" disabled={loading} onClick={loadMore}>
            {loading ? "Đang tải…" : "Tải thêm"}
          </button>
        </div>
      ) : null}

      {!isDesktop ? (
        <p className="muted rfq-footer-links">
          <Link href="/shop/settings">Cài đặt shop · Zalo</Link>
        </p>
      ) : null}
    </>
  );

  return (
    <div
      className={`rfq-seller-wide rfq-inbox-page rfq-inbox-page--workspace ${isDesktop ? "rfq-inbox-page--split" : ""}`}
    >
      {isDesktop ? (
        <div className="rfq-inbox-workspace">
          <aside className="rfq-inbox-list-panel" aria-label="Inbox RFQ">
            {listPanel}
          </aside>
          <section className="rfq-inbox-chat-panel" aria-label="Chat khách">
            <RfqShopInboxChatPane dispatchId={selectedId} />
          </section>
        </div>
      ) : (
        listPanel
      )}
    </div>
  );
}
