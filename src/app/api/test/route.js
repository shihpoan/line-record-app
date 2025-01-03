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
    console.log("url", url);
    console.log("properties", properties);
    // 客戶名稱
    const customerName = properties["客戶名稱"]["relation"];
    console.log("customerName", customerName);
    // 客戶名稱的 pageId
    const pageId = customerName[0]["id"];

    // 查詢該頁面的詳細資訊
    const pageData = await notion.pages.retrieve({
      page_id: "16c2c47291d980b788ddf63c56629581",
    });
    // console.log("pageData", pageData);
    const nameProperty = pageData.properties["姓名"];

    if (nameProperty && nameProperty.type === "title") {
      const nameValue = nameProperty.title
        .map((item) => item.text.content) // 提取每個文字項的內容
        .join(""); // 合併所有內容成一個字串
      console.log("姓名:", nameValue);
    } else {
      console.log("姓名欄位不存在或不是標題類型");
    }

    // 獲取聯絡人電話號碼集合
    // const contact = properties["人員聯絡電話集合"]["rollup"]["array"];
    // console.log("contact", contact);

    // 逐一發送訊息給每個聯絡人
    // for (const element of contact) {
    //   const phoneNumber = element["rich_text"][0]["plain_text"];
    //   console.log("Sending message to:", phoneNumber);

    //   // 假設這是 LINE userId 的對應電話號碼，可以用來發送訊息
    //   await sendMessageToLine(
    //     `${phoneNumber}`,
    //     `Notion 內容已經更新，請查看最新資訊。\n請點擊連結查看：${url}
    //     `
    //   );
    // }

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
