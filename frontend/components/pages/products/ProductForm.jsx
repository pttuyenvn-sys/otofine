"use client";

import { useState } from "react";
import { createProduct } from "../../../services/product.api";

export default function ProductForm() {
  const [form, setForm] = useState({});
  const [images, setImages] = useState([]);

  const submit = async () => {
    const fd = new FormData();
    Object.keys(form).forEach((k) => fd.append(k, form[k]));
    images.forEach((img) => fd.append("images", img));

    await createProduct(fd);
  };

  return (
    <>
      <input
        placeholder="PartNumber"
        onChange={(e) => setForm({ ...form, partNumber: e.target.value })}
      />
      <input
        placeholder="PartName"
        onChange={(e) => setForm({ ...form, partName: e.target.value })}
      />

      <input
        type="file"
        multiple
        onChange={(e) => setImages([...e.target.files])}
      />

      <button onClick={submit}>Lưu</button>
    </>
  );
}
