import React from "react";
import Link from "next/link";

export default function FooterSection({ applyVehicleQuickFilter }) {
  return (
    <footer className="footer-main">
      <div className="footer-top-strip" aria-hidden="true" />
      <div className="footer-grid">
        <div className="footer-col footer-brand">
          <div className="footer-brand-mark">Otofine</div>
          <p>
            Nền tảng kết nối người mua và cửa hàng phụ tùng ô tô trên
            toàn quốc. Tìm đúng phụ tùng, đúng xe, đúng giá.
          </p>
        </div>
        <div className="footer-col">
          <h3>Hãng xe phổ biến</h3>
          <button
            type="button"
            className="footer-link"
            onClick={() => applyVehicleQuickFilter("Toyota", "")}
          >
            Toyota
          </button>
          <button
            type="button"
            className="footer-link"
            onClick={() => applyVehicleQuickFilter("Mazda", "")}
          >
            Mazda
          </button>
          <button
            type="button"
            className="footer-link"
            onClick={() => applyVehicleQuickFilter("Hyundai", "")}
          >
            Hyundai
          </button>
          <button
            type="button"
            className="footer-link"
            onClick={() => applyVehicleQuickFilter("Kia", "")}
          >
            Kia
          </button>
          <button
            type="button"
            className="footer-link"
            onClick={() => applyVehicleQuickFilter("Ford", "")}
          >
            Ford
          </button>
          <button
            type="button"
            className="footer-link"
            onClick={() => applyVehicleQuickFilter("Honda", "")}
          >
            Honda
          </button>
        </div>
        <div className="footer-col">
          <h3>Hỗ trợ</h3>
          <a href="/">Giới thiệu</a>
          <a href="/">Liên hệ</a>
          <a href="/">Hướng dẫn mua hàng</a>
          <a href="/">Chính sách bảo mật</a>
          <a href="/">Điều khoản sử dụng</a>
        </div>
      </div>
      <div className="footer-bottom">
        © 2026 Otofine.com - Một chi tiết nhỏ, bảo vệ hành trình lớn
      </div>
    </footer>
  );
}

