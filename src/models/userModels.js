import mongoose, { Schema, model, models } from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true }, // 使用者唯一 ID（例如 LINE userId）
    name: { type: String, required: true }, // 使用者名稱
    phoneNumber: { type: String }, // 綁定的電話號碼
    email: { type: String }, // 電子郵件
    status: { type: String, default: "active" }, // 使用者狀態 (例如 "active", "inactive")
  },
  {
    timestamps: true, // 自動加入 createdAt 和 updatedAt 時間戳
  },
  {
    strict: false, // 允許動態擴展欄位
  }
);

const userModel = models.users || model("users", UserSchema);

export default userModel;
