import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h1>Không tìm thấy trang</h1>
      <Link href="/" style={{ color: "#2563eb" }}>
        Về trang chủ
      </Link>
    </div>
  );
}
