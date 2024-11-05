import mongoose, { Schema, model, models } from "mongoose";

const TodoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    userId: { type: String, required: true },
    description: String,
    dueDate: Date,
    status: { type: String, default: "尚未完成" },
  },
  {
    timestamps: true,
  },
  {
    strict: false,
  }
);

const todoModel = models.todos || model("todos", TodoSchema);

export default todoModel;
