import axiosClient from "@/api/axiosClient";

export function getMyPublicPage() {
  return axiosClient.get("/shop/public-page");
}

export function updateMyPublicPage(payload) {
  return axiosClient.put("/shop/public-page", payload);
}

export function checkSlugAvailability(slug) {
  return axiosClient.get("/shop/public-page/check-slug", { params: { slug } });
}

export function uploadAvatar(file) {
  const fd = new FormData();
  fd.append("file", file);
  return axiosClient.post("/shop/public-page/upload-avatar", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function uploadCover(file) {
  const fd = new FormData();
  fd.append("file", file);
  return axiosClient.post("/shop/public-page/upload-cover", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export default axiosClient;
