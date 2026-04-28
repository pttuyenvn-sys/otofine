// middlewares/uploadExcel.js
import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: "uploads/excel",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const uploadExcel = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(xlsx|xls)$/)) {
      cb(new Error("Only Excel files allowed"));
    }
    cb(null, true);
  },
});
