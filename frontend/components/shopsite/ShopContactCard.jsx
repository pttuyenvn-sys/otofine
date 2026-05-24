import ShopSection from "./ShopSection";

/**
 * Compact contact information card — phone, zalo, facebook,
 * address, working hours + a placeholder map block.
 */
export default function ShopContactCard({ shop, variant = "compact" }) {
  if (!shop) return null;
  const dense = variant === "compact";

  return (
    <ShopSection title="Thông tin liên hệ" className="h-full">
      <ul className={`space-y-${dense ? 2 : 3} text-sm text-gray-800`}>
        <ContactRow icon={<PhoneIcon />} label="Điện thoại">
          <a href={`tel:${shop.phone.replace(/\s/g, "")}`} className="hover:text-[#e60012]">
            {shop.phone}
          </a>
        </ContactRow>
        <ContactRow icon={<ChatIcon />} label="Zalo">
          <a
            href={`https://zalo.me/${shop.zalo.replace(/\s/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#e60012]"
          >
            Zalo: {shop.zalo}
          </a>
        </ContactRow>
        <ContactRow icon={<FacebookIcon />} label="Facebook">
          <a
            href={shop.facebook.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#e60012]"
          >
            {shop.facebook.label}
          </a>
        </ContactRow>
        <ContactRow icon={<PinIcon />} label="Địa chỉ">
          <span>{shop.address}</span>
        </ContactRow>
        <ContactRow icon={<ClockIcon />} label="Giờ làm việc">
          <div className="space-y-0.5">
            {shop.workingHoursLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </ContactRow>
      </ul>

      <div className="mt-3 rounded-xl overflow-hidden border border-gray-100 bg-gradient-to-br from-gray-100 via-gray-50 to-white relative aspect-[16/8]">
        {/* Phase 1 placeholder for the Google Maps embed. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22><rect width=%22120%22 height=%22120%22 fill=%22%23f3f4f6%22/><path d=%22M0 60 L120 60 M60 0 L60 120%22 stroke=%22%23e5e7eb%22 stroke-width=%221%22/></svg>')] opacity-50"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <a
            href={`https://www.google.com/maps?q=${encodeURIComponent(shop.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#e60012] text-white text-xs font-medium px-3 py-1.5 rounded-full shadow"
          >
            <PinIcon />
            Chỉ đường
          </a>
        </div>
      </div>
    </ShopSection>
  );
}

function ContactRow({ icon, label, children }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-50 text-[#e60012] shrink-0"
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="sr-only">{label}</div>
        <div className="text-sm text-gray-800 break-words">{children}</div>
      </div>
    </li>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <path d="M22 12.07C22 6.51 17.52 2 12 2S2 6.51 2 12.07c0 5 3.66 9.15 8.44 9.93v-7.02H7.9v-2.91h2.54V9.84c0-2.51 1.49-3.9 3.78-3.9 1.1 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.91h-2.33V22c4.78-.78 8.43-4.92 8.43-9.93z" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
