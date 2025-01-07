import { NextResponse } from "next/server.js";

import connectDB from "@/lib/mongodb.js";
import userModel from "@/models/userModels.js";

import { Client } from "@notionhq/client";
// 初始化 Notion 客戶端
const notion = new Client({ auth: process.env.NEXT_NOTION_API_KEY });

// notion webhook
export async function POST(request) {
  try {
    // 解析 JSON 請求體
    // console.log("request", request);
    const headers = request.headers;
    // console.log("headers", headers);
    const user = headers.get("user"); // 使用 .get() 方法
    console.log("user", user);
    const body = await request.json();
    // console.log("body", body);
    const { data } = body;
    const { url, properties } = data;

    // 取得 notion DB 資料
    const notionDbDatas = await notion.databases.query({
      database_id: `1702c47291d98067b2ebccc11c1b047f`,
    });
    // console.log("notionDbDatas", notionDbDatas);

    // 結果回應
    const notionDbResult = notionDbDatas.results;
    // 從 results 中 filter 1.今天日期 2.已完成 資料

    const todayCompleteData = notionDbResult.filter((data) => {
      // 使否已完成
      const isComplete = data.properties["狀態"]["status"]["name"] === "完成";
      // console.log("isComplete", isComplete);
      // 今天日期
      const today = new Date().toISOString().split("T")[0];
      // console.log("today", today);

      console.log("dates", data.properties["預計執行日期"]["date"]);

      // 完成日期是否 == 今天
      const isToday =
        (data.properties["完成日期"]["date"]
          ? data.properties["完成日期"]["date"]["start"]
          : null) === today;
      // console.log("isToday", isToday);

      // user 有在 負責人 中
      const usersphones = data.properties["負責人電話匯總"]["rollup"][
        "array"
      ].map((person) => person["rich_text"][0]["plain_text"]);
      // console.log("users", users);
      const hasUser = usersphones.some((person) => person === user);
      // console.log("hasUser", hasUser);

      return isComplete && isToday && hasUser;
    });
    // console.log("todayCompleteData", todayCompleteData);
    const returnJobs = todayCompleteData.map((data) => {
      const { properties } = data;
      const jobName = properties["工作名稱"]["title"][0]["plain_text"];
      const jobDate = properties["完成日期"]["date"]["start"];
      const userName = properties["負責人姓名匯總"]["rollup"]["array"]
        .map((person) => person["title"][0]["plain_text"])
        .toString();

      return { jobName, jobDate, userName };
    });
    const message = returnJobs
      .map((job, index) => {
        return `${index + 1}. ${job.jobName}\n日期: ${job.jobDate}\n負責人: ${
          job.userName
        }\n`;
      })
      .join("\n");

    console.log("message", message);

    // 透過 LINE 通知使用者
    await sendMessageToLine(user, `本日完成任務\n ${message}`);

    return new NextResponse(JSON.stringify({ message: "Hello" }), {
      status: 200,
    });
  } catch (e) {
    console.log("Error:", e);
    return new Response(
      JSON.stringify({ message: "Error connecting to the database" }),
      {
        status: 500,
      }
    );
  }
}

// 發送訊息到 LINE 使用者
async function sendMessageToLine(phoneNumber, messageText) {
  try {
    // 這裡的 phoneNumber 應該是 LINE userId，根據你的情況需要處理
    const lineUserId = await getLineUserIdByPhone(phoneNumber); // 假設有一個函數可以根據電話號碼獲取 LINE userId

    if (!lineUserId) {
      console.log(`No LINE userId found for phone number: ${phoneNumber}`);
      return;
    }

    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer MJqqxUQC5g8EYatakATK5XZAlyievAlwgw3KIgoxzyWYQaJkYQNrBy61gTBz6jgm1ojOXN4Y1O6iozN5H6Ij/4ZEDfGL/lnD1vyy3PCKbMH4OC0QctRwXD/4/yLrhkubm76w/k0o4LfghcIQ0YvpyQdB04t89/1O/w1cDnyilFU=`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [
          {
            type: "text",
            text: messageText,
          },
        ],
      }),
    });

    const data = await response.json();
    console.log("Message sent response:", data);
  } catch (error) {
    console.error("Error sending message to LINE user:", error);
  }
}

// 根據電話號碼查詢 LINE userId
async function getLineUserIdByPhone(phoneNumber) {
  try {
    await connectDB();
    // 在資料庫中查找對應電話號碼的使用者
    const user = await userModel.findOne({ phoneNumber: phoneNumber });

    // 如果找到了使用者，返回 LINE userId
    if (user) {
      return user.userId;
    }

    // 如果找不到對應的使用者，返回 null 或自定義錯誤訊息
    console.log(`No LINE userId found for phone number: ${phoneNumber}`);
    return null;
  } catch (error) {
    console.error("Error finding user by phone number:", error);
    throw new Error("Database query failed");
  }
}
