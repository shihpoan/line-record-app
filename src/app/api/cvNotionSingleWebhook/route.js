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
    const body = await request.json();
    const { data } = body;
    const { url, properties } = data;
    // console.log("data", data);
    // console.log("url", url);
    // console.log("properties", properties);

    // 定義：工作名稱
    const jobName = properties["工作名稱"]["title"][0]["plain_text"];
    // console.log("jobName", jobName);
    // 定義：負責人陣列
    const owners = properties["負責人"]["relation"];
    // console.log("owners", owners);

    // 逐一發送訊息給每個負責人
    for (const owner of owners) {
      const ownerPageId = owner["id"];
      // console.log("ownerPage", ownerPageId);
      // 查詢該頁面的詳細資訊
      const owerPageData = await notion.pages.retrieve({
        page_id: `${ownerPageId}`,
      });
      // console.log("pageData", owerPageData);
      // 定義：負責人姓名
      const ownerName =
        owerPageData.properties["姓名"]["title"][0]["plain_text"];
      // console.log("ownerName", ownerName);
      // 定義：負責人 line通知綁定碼
      const ownerLineCode =
        owerPageData.properties["line通知綁定碼"]["rich_text"][0]["plain_text"];
      // console.log("ownerLineCode", ownerLineCode);

      // 發送訊息到 LINE 使用者
      await sendMessageToLine(
        `${ownerLineCode}`,
        `您負責的工作「${jobName}」已經更新，請查看最新資訊。\n請點擊連結查看：${url}`,
        "-------------------------------------------------------------------"
      );
    }

    async function sendMessageToLine(phoneNumber, messageText, line) {
      // 連線 DB
      await connectDB();
      // 透過電話號碼查詢 LINE userId
      const lineUserId = await getLineUserIdByPhone(phoneNumber);
      // 如果找不到 LINE userId，返回
      if (!lineUserId) {
        console.log(`No LINE userId found for phone number: ${phoneNumber}`);
        return;
      }
      // 發送訊息到 LINE 使用者
      const response = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_LINE_CHANNEL_ACCESS_TOKEN}`,
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
      // 解析回應
      const data = await response.json();
      // console.log("Message sent response:", data);
    }

    // getLineUserIdByPhone
    async function getLineUserIdByPhone(phoneNumber) {
      try {
        // 在資料庫中查找對應電話號碼的使用者
        const user = await userModel
          .findOne({ phoneNumber: phoneNumber })
          .exec();
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

    // 取得 notion DB 資料
    const notionDbDatas = await notion.databases.query({
      database_id: `1702c47291d98067b2ebccc11c1b047f`,
    });
    // console.log("notionDbDatas", notionDbDatas);

    // 結果回應
    const notionDbResult = notionDbDatas.results;
    // 從 results 中 filter 1.今天日期 2.已完成 資料

    const test = notionDbResult[0]["properties"];
    // console.log("test", test);

    const todayCompleteData = notionDbResult.filter((data) => {
      // 使否已完成
      const isComplete = data.properties["狀態"]["status"]["name"] === "完成";
      // 今天日期
      const today = new Date().toISOString().split("T")[0];
      console.log("today", today);
      // 完成日期是否 == 今天
      const isToday =
        (data.properties["完成日期"]["date"]
          ? data.properties["完成日期"]["date"]["start"]
          : null) === today;
      console.log("isToday", isToday);

      return isComplete && isToday;
    });
    console.log("todayCompleteData", todayCompleteData);

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
