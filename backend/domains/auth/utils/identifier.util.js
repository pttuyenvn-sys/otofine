/** Normalize email or VN phone for lookup. */
export function normalizeIdentifier(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { type: "empty", value: "" };

  if (s.includes("@")) {
    return { type: "email", value: s.toLowerCase() };
  }

  const digits = s.replace(/\D/g, "");
  if (digits.length >= 9) {
    let phone = digits;
    if (phone.startsWith("84") && phone.length >= 11) {
      phone = `0${phone.slice(2)}`;
    }
    if (!phone.startsWith("0") && phone.length === 9) {
      phone = `0${phone}`;
    }
    return { type: "phone", value: phone };
  }

  return { type: "unknown", value: s };
}
