"use client";

// Bảng SP shop: Xem (form) + Xóa
import "./Product.css";

const stripHtml = (html) => {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return div.textContent || div.innerText || "";
};

export default function ProductTable({
  data = [],
  selectedIds = [],
  onSelectChange,
  onEdit,
  onDelete,
}) {
  const allChecked = data.length > 0 && selectedIds.length === data.length;

  return (
    <div className="AdminDulieuTable">
      <table>
        <thead>
          <tr>
            <th>
              <div className="cell-shop">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) =>
                    onSelectChange(
                      e.target.checked ? data.map((p) => p.id) : [],
                    )
                  }
                />
                <span>ShopID</span>
              </div>
            </th>
            <th>PartNumber</th>
            <th>PartName</th>
            <th>Stock</th>
            <th>Price</th>
            <th>Car</th>
            <th>Origin</th>
            <th>ShortDescription</th>
            <th>FullDescription</th>
            <th>Weight</th>
            <th>Length</th>
            <th>Width</th>
            <th>Height</th>
            <th>Hành động</th>
          </tr>
        </thead>

        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={14} style={{ textAlign: "center", padding: 20 }}>
                Chưa có sản phẩm nào
              </td>
            </tr>
          ) : (
            data.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="cell-shop">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.id)}
                      onChange={() =>
                        onSelectChange(
                          selectedIds.includes(p.id)
                            ? selectedIds.filter((x) => x !== p.id)
                            : [...selectedIds, p.id],
                        )
                      }
                    />
                    <span>{p.shopId}</span>
                  </div>
                </td>
                <td>{p.partNumber}</td>
                <td>{p.partName}</td>
                <td className="text-center">{p.stock}</td>
                <td className="text-right">
                  {Number(p.price || 0).toLocaleString("vi-VN")}
                </td>
                <td
                  dangerouslySetInnerHTML={{
                    __html: (p.car || "").replace(/\n/g, "<br/>"),
                  }}
                />
                <td>{p.origin}</td>
                <td className="truncate-1-line">
                  {stripHtml(p.shortDescription)}
                </td>
                <td className="truncate-1-line">
                  {stripHtml(p.fullDescription)}
                </td>
                <td className="text-right">{p.weight}</td>
                <td className="text-right">{p.length}</td>
                <td className="text-right">{p.width}</td>
                <td className="text-right">{p.height}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      type="button"
                      className="btnXemanh"
                      onClick={() => onEdit(p)}
                    >
                      Xem
                    </button>

                    <button
                      type="button"
                      className="btnXoa"
                      onClick={() => onDelete(p.id)}
                    >
                      Xóa
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
