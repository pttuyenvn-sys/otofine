export function sendHttpError(res, err, fallbackMessage = "Lỗi server") {
  const status = Number(err.status || err.statusCode || 500);
  const code = String(err.message || "INTERNAL");
  const body = { code };
  if (status >= 500) {
    body.message = fallbackMessage;
    if (process.env.RFQ_DEBUG_ERRORS === "1" && err?.code) {
      body.debug = String(err.code);
      if (err.sqlMessage) body.debug_sql = String(err.sqlMessage);
    }
  } else {
    body.message = mapMessage(code);
  }
  if (code === "DEDUPE_COOLDOWN" && err.existingPublicId) {
    body.existingPublicId = err.existingPublicId;
  }
  if (code === "VIEWER_LOCKED" && err.lockRemainingSec != null) {
    body.lockRemainingSec = err.lockRemainingSec;
  }
  res.status(Number.isFinite(status) ? status : 500).json(body);
}

function mapMessage(code) {
  const m = {
    INVALID_PHONE: "Số điện thoại không hợp lệ",
    SHORT_DESCRIPTION: "Mô tả quá ngắn",
    LONG_DESCRIPTION: "Mô tả quá dài",
    INVALID_DESCRIPTION: "Mô tả chưa cụ thể — vui lòng ghi rõ phụ tùng hoặc triệu chứng",
    INVALID_VEHICLE: "Vui lòng chọn đầy đủ hãng, dòng và năm sản xuất",
    TOO_MANY_IMAGES: "Tối đa 10 ảnh cho mỗi yêu cầu",
    INVALID_INPUT: "Thông tin không hợp lệ",
    NOT_FOUND: "Không tìm thấy",
    INVALID_STATE: "Trạng thái không hợp lệ",
    PHONE_MISMATCH: "Số điện thoại không khớp",
    OTP_EXPIRED: "Mã OTP hết hạn",
    OTP_LOCKED: "Quá nhiều lần thử OTP",
    OTP_WRONG: "Mã OTP không đúng",
    INVALID_PRICE: "Giá không hợp lệ",
    QUOTE_EXISTS: "Shop đã gửi báo giá cho RFQ này",
    MISSING_FILE: "Thiếu file ảnh",
    MISSING_PUBLIC_ID: "Thiếu publicId",
    DEDUPE_COOLDOWN: "Đang có yêu cầu báo giá tương tự trong thời gian gần đây",
    UPLOAD_TOO_LARGE: "Ảnh vượt quá dung lượng cho phép",
    INVALID_MIME: "Định dạng ảnh không được hỗ trợ",
    UPLOAD_REJECTED: "Không thể xử lý file tải lên",
    INVALID_IMAGE: "Ảnh không hợp lệ hoặc đã bị thay đổi",
    IMAGE_TOO_LARGE: "Ảnh quá lớn (độ phân giải)",
    VIEWER_LOCKED: "Thử lại sau (giới hạn bảo mật)",
    VIEWER_TOKEN_BRUTE: "Quá nhiều lần thử token",
    INVALID_LINE_TYPE: "Loại hàng không hợp lệ",
    ZALO_ESC_OFF: "Chưa bật escalation Zalo trên server",
    EMPTY_MESSAGE: "Tin nhắn không được để trống",
    MESSAGE_TOO_LONG: `Tin nhắn tối đa ${2000} ký tự`,
    CONVERSATION_CLOSED: "Hội thoại đã đóng",
    INVALID_MESSAGE_ID: "Tin nhắn không hợp lệ",
    MESSAGE_SPAM: "Tin nhắn không hợp lệ hoặc bị coi là spam",
    RATE_LIMIT: "Quá nhiều yêu cầu — thử lại sau",
  };
  return m[code] || code;
}
