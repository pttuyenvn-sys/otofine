"use client";

import React, { useState, useEffect } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

import {
  getMyShop,
  createShop,
  updateMyShop,
  uploadEditorImage,
} from "../../api/shopApi";

import ShopAddressSelector from "../ShopAddressSelector";
import { useRouter } from "next/navigation";
import { API_ORIGIN } from "@/lib/config";

export default function ShopSettings() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  // 🔥 FIX 1: thêm shopId
  const [shopId, setShopId] = useState(null);

  const [avatarFile, setAvatarFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);

  const [avatarPreview, setAvatarPreview] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    zalo: "",
    website: "",
    address: {
      provinceId: "",
      wardId: "",
      detail: "",
    },
    descriptionHtml: "",
    salePolicy: "",
    warrantyPolicy: "",
  });

  // LOAD SHOP DATA
  useEffect(() => {
    async function load() {
      try {
        const res = await getMyShop();

        if (res.data && res.data.id) {
          const s = res.data;

          // 🔥 FIX 2: set shopId
          setShopId(s.id);
          try {
            localStorage.setItem("shopId", String(s.id));
          } catch (_) { }

          setForm({
            name: s.name || "",
            phone: s.phone || "",
            email: s.email || "",
            zalo: s.zalo || "",
            website: s.website || "",
            address: {
              provinceId: s.provinceId || "",
              wardId: s.wardId || "",
              detail: s.addressDetail || "",
            },
            descriptionHtml: s.descriptionHtml || "",
            salePolicy: s.salePolicy || "",
            warrantyPolicy: s.warrantyPolicy || "",
          });

          const base = API_ORIGIN;

          if (s.avatar) {
            setAvatarPreview(
              s.avatar.startsWith("http") ? s.avatar : base + s.avatar
            );
          }

          if (s.cover) {
            setCoverPreview(
              s.cover.startsWith("http") ? s.cover : base + s.cover
            );
          }
        }
      } catch (err) {
        if (err?.response?.status === 401) {
          router.push("/shop/login");
        }
      }
      setLoading(false);
    }

    load();
  }, []);

  // IMAGE UPLOAD FOR EDITOR
  const imageUploadHandler = async (file) => {
    const res = await uploadEditorImage(file);
    const location = res.data.location;
    const base = API_ORIGIN;
    return location.startsWith("/") ? base + location : location;
  };

  const quillModules = {
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline"],
        [{ color: [] }, { background: [] }],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link", "image"],
        ["clean"],
      ],
      handlers: {
        image: function () {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.click();

          input.onchange = async () => {
            const file = input.files[0];
            const url = await imageUploadHandler(file);
            const range = this.quill.getSelection();
            this.quill.insertEmbed(range ? range.index : 0, "image", url);
          };
        },
      },
    },
  };

  // SUBMIT FORM
  const handleSave = async () => {
    try {
      const fd = new FormData();

      fd.append("name", form.name);
      fd.append("phone", form.phone);
      fd.append("email", form.email);
      fd.append("zalo", form.zalo);
      fd.append("website", form.website);

      fd.append("provinceId", form.address.provinceId || "");
      fd.append("wardId", form.address.wardId || "");
      fd.append("addressDetail", form.address.detail || "");

      fd.append("descriptionHtml", form.descriptionHtml);
      fd.append("salePolicy", form.salePolicy);
      fd.append("warrantyPolicy", form.warrantyPolicy);

      if (avatarFile) fd.append("avatar", avatarFile);
      if (coverFile) fd.append("cover", coverFile);

      if (!shopId) {
        // 👉 CHƯA CÓ SHOP → CREATE
        const cre = await createShop(fd);
        if (cre.data?.id != null) {
          const sid = String(cre.data.id);
          localStorage.setItem("shopId", sid);
          setShopId(cre.data.id);
        }
      } else {
        // 👉 ĐÃ CÓ SHOP → UPDATE
        await updateMyShop(fd);
      }

      alert("Lưu shop thành công!");
    } catch (err) {
      console.error(err);
      alert("Lỗi khi lưu thông tin shop!");
    }
  };

  if (loading) return <div>Đang tải...</div>;

  return (
    <div className="card">
      <h3 className="mb-4">Thiết lập Shop</h3>

      {/* UPLOAD AVATAR */}
      <div className="form-group">
        <label>Avatar</label>
        <input
          type="file"
          className="form-control"
          onChange={(e) => {
            setAvatarFile(e.target.files[0]);
            setAvatarPreview(URL.createObjectURL(e.target.files[0]));
          }}
        />
        {avatarPreview && (
          <img
            src={avatarPreview}
            alt="avatar"
            style={{ width: 90, marginTop: 8, borderRadius: 8 }}
          />
        )}
      </div>

      {/* UPLOAD COVER */}
      <div className="form-group">
        <label>Ảnh bìa</label>
        <input
          type="file"
          className="form-control"
          onChange={(e) => {
            setCoverFile(e.target.files[0]);
            setCoverPreview(URL.createObjectURL(e.target.files[0]));
          }}
        />
        {coverPreview && (
          <img
            src={coverPreview}
            alt="cover"
            style={{ width: "100%", marginTop: 8, borderRadius: 8 }}
          />
        )}
      </div>

      {/* BASIC INFO */}
      <div className="form-group">
        <label>Tên shop</label>
        <input
          className="form-control"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div className="form-group" style={{ flex: 1 }}>
          <label>Số điện thoại</label>
          <input
            className="form-control"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>

        <div className="form-group" style={{ flex: 1 }}>
          <label>Email</label>
          <input
            className="form-control"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Website</label>
        <input
          className="form-control"
          value={form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
        />
      </div>

      {/* ADDRESS */}
      <h4 className="mt-4 mb-2">Địa chỉ</h4>
      <ShopAddressSelector
        value={form.address}
        onChange={(addr) => setForm({ ...form, address: addr })}
      />

      {/* DESCRIPTION */}
      <h4 className="mt-4">Giới thiệu shop</h4>
      <ReactQuill
        value={form.descriptionHtml}
        modules={quillModules}
        onChange={(v) => setForm({ ...form, descriptionHtml: v })}
      />

      {/* SALE POLICY */}
      <h4 className="mt-4">Chính sách bán hàng</h4>
      <ReactQuill
        value={form.salePolicy}
        modules={quillModules}
        onChange={(v) => setForm({ ...form, salePolicy: v })}
      />

      {/* WARRANTY POLICY */}
      <h4 className="mt-4">Chính sách bảo hành</h4>
      <ReactQuill
        value={form.warrantyPolicy}
        modules={quillModules}
        onChange={(v) => setForm({ ...form, warrantyPolicy: v })}
      />

      <button className="btn btn-primary mt-4" onClick={handleSave}>
        Cập nhật Shop
      </button>
    </div>
  );
}
