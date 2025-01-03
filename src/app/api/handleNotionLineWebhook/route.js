import { NextResponse } from "next/server.js";
import connectDB from "@/lib/mongodb.js";
import redis from "@/lib/redis.js";

import userModel from "@/models/userModels.js";

export async function POST(req) {
  try {
    const body = await req.json();
    const { events } = body;

    console.log("start");

    await connectDB();

    if (events) {
      for (const event of events) {
        const { replyToken, source, type } = event;
        const userId = source?.userId;

        if (type === "join" || type === "follow") {
          // 處理加入事件
          console.log("join event");
          const redisKey = `bindPhone:${userId}`;
          await redis.set(redisKey, "waitingPhone", "EX", 300); // 暫存 5 分鐘
          await replyToLine(replyToken, [
            { type: "text", text: "歡迎加入！請輸入您的電話號碼進行綁定。" },
          ]);
        } else if (type === "message") {
          // 處理訊息事件
          const { message } = event;
          const userMessage = message?.text; // 假設是 text 類型訊息

          const redisKey = `bindPhone:${userId}`;
          const currentState = await redis.get(redisKey);

          if (currentState === "waitingPhone") {
            // 驗證電話號碼格式
            const phoneRegex = /^09\d{8}$/; // 台灣手機號碼格式
            if (phoneRegex.test(userMessage)) {
              // 綁定電話號碼
              await savePhoneToDB(userId, userMessage);
              await redis.del(redisKey); // 清除暫存
              await replyToLine(replyToken, [
                { type: "text", text: "電話號碼綁定成功！" },
              ]);
            } else {
              // 提示重新輸入
              await replyToLine(replyToken, [
                { type: "text", text: "格式錯誤，請輸入有效的電話號碼。" },
              ]);
            }
          }
        }
      }
    }

    return new NextResponse(JSON.stringify({ message: "Success" }), {
      status: 200,
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ message: "Error connecting to the database" }),
      { status: 500 }
    );
  }
}

async function savePhoneToDB(userId, phoneNumber) {
  // 假設有 User model
  await userModel.updateOne(
    { userId },
    { $set: { phoneNumber } },
    { upsert: true }
  );
}

async function replyToLine(replyToken, messages) {
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer MJqqxUQC5g8EYatakATK5XZAlyievAlwgw3KIgoxzyWYQaJkYQNrBy61gTBz6jgm1ojOXN4Y1O6iozN5H6Ij/4ZEDfGL/lnD1vyy3PCKbMH4OC0QctRwXD/4/yLrhkubm76w/k0o4LfghcIQ0YvpyQdB04t89/1O/w1cDnyilFU=`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });
  return response.json();
}
