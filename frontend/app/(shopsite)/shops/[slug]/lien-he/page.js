import { notFound } from "next/navigation";
import ShopSection from "@/components/shopsite/ShopSection";
import { fetchPublicShopContact, getShopCanonicalUrl } from "@/services/shopPublic.service";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return { alternates: { canonical: await getShopCanonicalUrl(slug, "lien-he") } };
}

export default async function ShopTenantContactPage({ params }) {
  const { slug } = await params;
  const contact = await fetchPublicShopContact(slug);
  if (!contact) notFound();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
      <div className="lg:col-span-7 space-y-3">
        <ShopSection title="Liên hệ với chúng tôi">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ContactBlock
              icon={<PhoneIcon />}
              label="Điện thoại"
              value={contact.phone}
              href={contact.phone ? `tel:${contact.phone.replace(/\s/g, "")}` : null}
            />
            <ContactBlock
              icon={<ChatIcon />}
              label="Zalo"
              value={contact.zalo}
              href={contact.zalo ? `https://zalo.me/${contact.zalo.replace(/\s/g, "")}` : null}
              external
            />
            <ContactBlock
              icon={<FacebookIcon />}
              label="Facebook"
              value={contact.facebook?.label}
              href={contact.facebook?.url}
              external
            />
            <ContactBlock
              icon={<MailIcon />}
              label="Email"
              value={contact.email}
              href={contact.email ? `mailto:${contact.email}` : null}
            />
            <ContactBlock
              icon={<PinIcon />}
              label="Địa chỉ"
              value={contact.address}
              href={contact.address ? `https://www.google.com/maps?q=${encodeURIComponent(contact.address)}` : null}
              external
              wide
            />
            <ContactBlock
              icon={<ClockIcon />}
              label="Giờ làm việc"
              value={(contact.workingHoursLines || []).join(" · ") || "Liên hệ shop"}
              wide
            />
          </div>
        </ShopSection>

        <ShopSection title="Bản đồ" bodyClassName="!p-0">
          <div className="relative aspect-[16/9] rounded-b-2xl overflow-hidden bg-gradient-to-br from-gray-100 via-gray-50 to-white">
            <div
              aria-hidden
              className="absolute inset-0 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><rect width=%22120%22 height=%22120%22 fill=%22%23f3f4f6%22/><path d=%22M0 60 L120 60 M60 0 L60 120%22 stroke=%22%23e5e7eb%22 stroke-width=%221%22/></svg>')] opacity-60"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-600">
              <PinIcon large />
              <span className="text-sm text-center px-3">{contact.address || "Đang cập nhật"}</span>
              {contact.address && (
                <a
                  href={`https://www.google.com/maps?q=${encodeURIComponent(contact.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-2 bg-[#e60012] hover:bg-[#c1000f] text-white text-xs font-medium px-3 py-1.5 rounded-full shadow"
                >
                  Mở trên Google Maps ›
                </a>
              )}
            </div>
          </div>
        </ShopSection>
      </div>

      <aside className="lg:col-span-5">
        <ShopSection title="Giờ làm việc chi tiết">
          <ul className="space-y-2 text-sm text-gray-800">
            {(contact.workingHoursLines || ["Liên hệ shop"]).map((line) => (
              <li
                key={line}
                className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-b-0 last:pb-0"
              >
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-gray-500 leading-relaxed">
            Ngoài giờ hành chính, vui lòng liên hệ qua Zalo hoặc Facebook
            để được hỗ trợ sớm nhất.
          </p>
        </ShopSection>

        <div className="mt-3">
          <ShopSection title="Hỗ trợ nhanh">
            <div className="flex flex-col gap-2">
              {contact.phone && (
                <a
                  href={`tel:${contact.phone.replace(/\s/g, "")}`}
                  className="inline-flex items-center justify-center gap-2 bg-[#e60012] hover:bg-[#c1000f] text-white text-sm font-semibold px-4 py-3 rounded-xl"
                >
                  <PhoneIcon /> Gọi ngay: {contact.phone}
                </a>
              )}
              {contact.zalo && (
                <a
                  href={`https://zalo.me/${contact.zalo.replace(/\s/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-white border border-gray-200 hover:border-[#e60012] hover:text-[#e60012] text-sm font-medium px-4 py-3 rounded-xl"
                >
                  <ChatIcon /> Nhắn Zalo
                </a>
              )}
            </div>
          </ShopSection>
        </div>
      </aside>
    </div>
  );
}

function ContactBlock({ icon, label, value, href, external, wide }) {
  if (!value) return null;
  const inner = (
    <>
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-50 text-[#e60012] shrink-0"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-sm font-medium text-gray-800 break-words">
          {value}
        </div>
      </div>
    </>
  );
  const base = `flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/40 px-3 py-3 hover:border-[#e60012] transition-colors ${
    wide ? "sm:col-span-2" : ""
  }`;
  return href ? (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={base}
    >
      {inner}
    </a>
  ) : (
    <div className={base}>{inner}</div>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M22 12.07C22 6.51 17.52 2 12 2S2 6.51 2 12.07c0 5 3.66 9.15 8.44 9.93v-7.02H7.9v-2.91h2.54V9.84c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.91h-2.33V22c4.78-.78 8.43-4.92 8.43-9.93z" />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}
function PinIcon({ large }) {
  const s = large ? 28 : 16;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
