import { NextResponse } from "next/server.js";

import connectDB from "@/lib/mongodb.js";
import redis from "@/lib/redis.js";
import todoModel from "@/models/todoModel.js";

export async function POST(req, res) {
  try {
    const body = await req.json();
    const { events } = body;

    console.log("start");

    await connectDB();

    if (events) {
      for (const event of events) {
        const { message, replyToken, source } = event;
        const userId = source.userId;

        console.log("message", message);

        if (message.type === "text") {
          let replyMessage = "";

          // 從 Redis 獲取用戶的 session 狀態
          const userSession = JSON.parse(await redis.get(userId));
          console.log("userSession", userSession);

          // 判斷用戶是否正在新增待辦事項
          if (userSession?.status === "addingTodo") {
            // 處理待辦事項標題輸入
            const title = message.text;

            // 輸入待辦事項標題
            replyMessage = [
              {
                type: "text",
                text: `請輸入待辦事項「${title}」的到期日期，範例：2024-11-01`,
              },
            ];

            await replyToLine(replyToken, replyMessage);

            // 在 redis 中加入待辦事項標題，並將狀態設為 "addingTodoDate"
            await redis.set(
              userId,
              JSON.stringify({ status: "addingTodoDate", title })
            );
          }
          // 指定新增時的日期
          else if (userSession?.status === "addingTodoDate") {
            // 處理輸入日期，例如 "2024-11-01"
            const dueDate = new Date(message.text);
            // dueDate +8 小時
            const endDate = dueDate.setHours(dueDate.getHours() + 8);

            // 不是正確的日期格式
            if (isNaN(dueDate.getTime())) {
              replyMessage = [
                {
                  type: "text",
                  text: "日期格式錯誤，請重新操作。格式範例：2024-11-01",
                },
              ];
              await redis.del(userId);

              await replyToLine(replyToken, replyMessage);
              return;
            }

            // 更新待辦事項的到期日期
            const userSession = JSON.parse(await redis.get(userId));
            const title = userSession.title;

            try {
              const newTodo = new todoModel({
                title: title,
                userId: userId,
                createdAt: dueDate,
                updateAt: endDate,
              });
              await newTodo.save();
              replyMessage = [
                {
                  type: "text",
                  text: `待辦事項「${newTodo.title}」已新增成功！`,
                },
              ];
            } catch (error) {
              replyMessage = [
                { type: "text", text: "新增待辦事項失敗，請稍後再試。" },
              ];
            }

            // 清除 session
            await redis.del(userId);
          }
          // 判斷用戶是否正在查詢指定日期待辦事項
          else if (userSession?.status === "inputDate") {
            // 處理輸入日期，例如 "2024-11-01,2024-11-30" => ["2024-11-01", "2024-11-30"]
            const textArray = message.text.split(",");
            const startDate = new Date(textArray[0]);
            const endDate = new Date(textArray[1]);

            // 不是正確的日期格式
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              replyMessage = [
                {
                  type: "text",
                  text: "日期格式錯誤，請重新操作。格式範例：2024-11-01,2024-11-30",
                },
              ];
              await redis.del(userId);

              await replyToLine(replyToken, replyMessage);
              return;
            }

            // 計算是否 endDate 比 startDate 晚超過一個月
            const isMoreThanOneMonth =
              (endDate.getFullYear() - startDate.getFullYear()) * 12 +
                (endDate.getMonth() - startDate.getMonth()) >
                1 ||
              (endDate.getMonth() - startDate.getMonth() === 1 &&
                endDate.getDate() >= startDate.getDate());

            console.log("超過一個月:", isMoreThanOneMonth);
            if (isMoreThanOneMonth) {
              replyMessage = [
                { type: "text", text: "日期區間不可超過一個月，請重新操作。" },
              ];
              await replyToLine(replyToken, replyMessage);
              await redis.del(userId);

              return;
            }

            // 查詢日期範圍內的待辦事項
            const pendingTodos = await todoModel
              .find({
                userId,
                status: "尚未完成",
                createdAt: {
                  $gte: startDate,
                  $lt: endDate,
                },
              })
              .sort({ createdAt: "asc" });
            // 查詢日期範圍內的已完成事項
            const completedTodos = await todoModel
              .find({
                userId,
                status: "完成",
                createdAt: {
                  $gte: startDate,
                  $lt: endDate,
                },
              })
              .sort({ createdAt: "asc" });

            if (pendingTodos.length === 0 && completedTodos.length === 0) {
              replyMessage = [
                { type: "text", text: `找不到 周期間 的待辦事項。` },
              ];
            } else {
              // 建立 Flex Message
              const pendingTodosFlexMessage =
                pendingTodos.length !== 0
                  ? {
                      type: "flex",
                      altText: `待辦事項列表`,
                      contents: {
                        type: "carousel", // 使用 carousel 顯示多個項目
                        contents: pendingTodos.map((todo) => ({
                          type: "bubble",
                          body: {
                            type: "box",
                            layout: "vertical",
                            spacing: "sm",
                            contents:
                              todo.status === "完成"
                                ? [
                                    {
                                      type: "text",
                                      text: todo.title,
                                      weight: "bold",
                                      size: "lg",
                                      color: "#333333",
                                    },
                                    {
                                      type: "text",
                                      text: `日期：${new Date(
                                        todo.createdAt
                                      ).toLocaleDateString()}`,
                                      size: "sm",
                                      color: "#999999",
                                    },
                                    {
                                      type: "text",
                                      text: `狀態：${todo.status}`,
                                      size: "sm",
                                      color: "#999999",
                                    },
                                  ]
                                : [
                                    {
                                      type: "text",
                                      text: todo.title,
                                      weight: "bold",
                                      size: "lg",
                                      color: "#333333",
                                    },
                                    {
                                      type: "text",
                                      text: `日期：${new Date(
                                        todo.createdAt
                                      ).toLocaleDateString()}`,
                                      size: "sm",
                                      color: "#999999",
                                    },
                                    {
                                      type: "text",
                                      text: `狀態：${todo.status}`,
                                      size: "sm",
                                      color: "#999999",
                                    },
                                    {
                                      type: "button",
                                      action: {
                                        type: "message",
                                        label: "完成",
                                        text: `完成 ${todo._id}`,
                                      },
                                      style: "primary",
                                      color: "#28a745", // 綠色按鈕
                                    },
                                    {
                                      type: "button",
                                      action: {
                                        type: "message",
                                        label: "刪除",
                                        text: `刪除 ${todo._id}`,
                                      },
                                      style: "primary",
                                      color: "#dc3545", // 紅色按鈕
                                    },
                                  ],
                          },
                        })),
                      },
                    }
                  : { type: "text", text: `找不到 周期間 的待辦事項。` };

              const completedTodosFlexMessage =
                completedTodos.length !== 0
                  ? {
                      type: "flex",
                      altText: `已完成事項列表`,
                      contents: {
                        type: "carousel", // 使用 carousel 顯示多個項目
                        contents: completedTodos.map((todo) => ({
                          type: "bubble",
                          body: {
                            type: "box",
                            layout: "vertical",
                            spacing: "sm",
                            contents: [
                              {
                                type: "text",
                                text: todo.title,
                                weight: "bold",
                                size: "lg",
                                color: "#333333",
                              },
                              {
                                type: "text",
                                text: `日期：${new Date(
                                  todo.createdAt
                                ).toLocaleDateString()}`,
                                size: "sm",
                                color: "#999999",
                              },
                              {
                                type: "text",
                                text: `狀態：${todo.status}`,
                                size: "sm",
                                color: "#999999",
                              },
                            ],
                          },
                        })),
                      },
                    }
                  : { type: "text", text: `找不到 周期間 的已完成事項。` };

              // 回傳 Flex Message
              await replyToLine(replyToken, [
                pendingTodosFlexMessage,
                completedTodosFlexMessage,
              ]);
            }

            // 清除 session
            await redis.del(userId);
          } else {
            switch (message.text) {
              case "新增":
                replyMessage = [
                  { type: "text", text: "請輸入待辦事項的標題：" },
                ];
                // 初始化 session 並儲存到 Redis
                await redis.set(
                  userId,
                  JSON.stringify({ status: "addingTodo" })
                );

                // 5 分鐘後清除 session
                await redis.expire(userId, 300);

                break;

              case "查看":
                // 回傳輸入 「已完成」、「未完成」、「輸入月份」按鈕
                replyMessage = [
                  {
                    type: "flex",
                    altText: "查看待辦事項",
                    contents: {
                      type: "bubble",
                      body: {
                        type: "box",
                        layout: "vertical",
                        spacing: "md",
                        contents: [
                          {
                            type: "text",
                            text: "待辦事項查詢",
                            weight: "bold",
                            size: "xl",
                            align: "center",
                            color: "#333333",
                          },
                          {
                            type: "text",
                            text: "選擇要查看的待辦事項狀態或輸入日期範圍",
                            size: "sm",
                            color: "#999999",
                            wrap: true,
                            align: "center",
                          },
                          {
                            type: "separator",
                            margin: "md",
                          },
                          {
                            type: "button",
                            style: "primary",
                            color: "#dc3545",
                            action: {
                              type: "message",
                              label: "📋 未完成事項",
                              text: "未完成",
                            },
                          },
                          {
                            type: "button",
                            style: "primary",
                            color: "#28a745",
                            action: {
                              type: "message",
                              label: "✅ 已完成事項",
                              text: "已完成",
                            },
                          },
                          {
                            type: "button",
                            style: "primary",
                            color: "#007bff",
                            action: {
                              type: "message",
                              label: "📅 本日待辦事項",
                              text: "本日",
                            },
                          },
                          {
                            type: "button",
                            style: "primary",
                            color: "#007bff",
                            action: {
                              type: "message",
                              label: "📅 本週待辦事項",
                              text: "本週",
                            },
                          },
                          {
                            type: "button",
                            style: "primary",
                            color: "#007bff",
                            action: {
                              type: "message",
                              label: "📅 本月待辦事項",
                              text: "本月",
                            },
                          },
                          {
                            type: "button",
                            style: "primary",
                            color: "#6c757d",
                            action: {
                              type: "message",
                              label: "📅 輸入日期範圍",
                              text: "輸入日期",
                            },
                          },
                        ],
                      },
                    },
                  },
                ];
                break;

              case "已完成":
                const completedTodos = await todoModel
                  .find({ userId, status: "完成" })
                  .sort({ createdAt: "asc" });
                if (completedTodos.length === 0) {
                  replyMessage = [
                    { type: "text", text: "目前沒有已完成事項。" },
                  ];
                  break;
                } else {
                  // 建立 Flex Message
                  const completedFlexMessage = {
                    type: "flex",
                    altText: "已完成事項列表",
                    contents: {
                      type: "carousel", // 使用 carousel 顯示多個項目
                      contents: completedTodos.map((todo) => ({
                        type: "bubble",
                        body: {
                          type: "box",
                          layout: "vertical",
                          spacing: "sm",
                          contents: [
                            {
                              type: "text",
                              text: todo.title,
                              weight: "bold",
                              size: "lg",
                              color: "#333333",
                            },
                            {
                              type: "text",
                              text: `日期：${new Date(
                                todo.createdAt
                              ).toLocaleDateString()}`,
                              size: "sm",
                              color: "#999999",
                            },
                            {
                              type: "text",
                              text: `狀態：${todo.status}`,
                              size: "sm",
                              color: "#999999",
                            },
                          ],
                        },
                      })),
                    },
                  };

                  // 回傳 Flex Message
                  await replyToLine(replyToken, [completedFlexMessage]);
                  // 結束此函數，避免發送額外的文字消息
                  break;
                }

              case "未完成":
                const pendingTodos = await todoModel
                  .find({ userId, status: "尚未完成" })
                  .sort({ createdAt: "asc" });
                if (pendingTodos.length === 0) {
                  replyMessage = [
                    { type: "text", text: "目前沒有未完成事項。" },
                  ];
                  break;
                } else {
                  // 建立 Flex Message
                  const pendingFlexMessage = {
                    type: "flex",
                    altText: "未完成事項列表",
                    contents: {
                      type: "carousel", // 使用 carousel 顯示多個項目
                      contents: pendingTodos.map((todo) => ({
                        type: "bubble",
                        body: {
                          type: "box",
                          layout: "vertical",
                          spacing: "sm",
                          contents: [
                            {
                              type: "text",
                              text: todo.title,
                              weight: "bold",
                              size: "lg",
                              color: "#333333",
                            },
                            {
                              type: "text",
                              text: `日期：${new Date(
                                todo.createdAt
                              ).toLocaleDateString()}`,
                              size: "sm",
                              color: "#999999",
                            },
                            {
                              type: "text",
                              text: `狀態：${todo.status}`,
                              size: "sm",
                              color: "#999999",
                            },
                          ],
                        },
                        footer: {
                          type: "box",
                          layout: "vertical",
                          spacing: "sm",
                          contents: [
                            {
                              type: "button",
                              action: {
                                type: "message",
                                label: "完成",
                                text: `完成 ${todo._id}`,
                              },
                              style: "primary",
                              color: "#28a745", // 綠色按鈕
                            },
                            {
                              type: "button",
                              action: {
                                type: "message",
                                label: "刪除",
                                text: `刪除 ${todo._id}`,
                              },
                              style: "primary",
                              color: "#dc3545", // 紅色按鈕
                            },
                          ],
                        },
                        styles: {
                          footer: {
                            separator: true, // 在footer上添加分隔線
                          },
                        },
                      })),
                    },
                  };

                  // 回傳 Flex Message
                  await replyToLine(replyToken, [pendingFlexMessage]);
                  break;
                }

              case "輸入日期":
                replyMessage = [
                  {
                    type: "text",
                    text: "請輸入日期（例如：2024-01-01,2024-01-31）：",
                  },
                ];
                // 初始化 session 並儲存到 Redis
                await redis.set(
                  userId,
                  JSON.stringify({ status: "inputDate" })
                );

                // 5 分鐘後清除 session
                await redis.expire(userId, 300);
                break;

              case "本日":
                const today = new Date();
                // today +8 小時
                today.setHours(today.getHours() + 8);
                // 設置今天的起始時間（00:00:00.000）並加上 8 小時
                const startOfDay = new Date(today.setHours(0, 0, 0, 0));

                // 結束日期 +8 小時
                // 設置今天的結束時間（23:59:59.999）並加上 8 小時
                const endOfDay = new Date(today.setHours(23, 59, 59, 999));

                console.log("startOfDay", startOfDay);
                console.log("endOfDay", endOfDay);

                // 查詢本日待辦事項
                const pendingTodayTodos = await todoModel
                  .find({
                    userId,
                    status: "尚未完成",
                    createdAt: {
                      $gte: startOfDay,
                      $lt: endOfDay,
                    },
                  })
                  .sort({ createdAt: "asc" });

                // 查詢已完成事項
                const completedTodayTodos = await todoModel
                  .find({
                    userId,
                    status: "完成",
                    createdAt: {
                      $gte: startOfDay,
                      $lt: endOfDay,
                    },
                  })
                  .sort({ createdAt: "asc" });

                if (
                  pendingTodayTodos.length === 0 &&
                  completedTodayTodos.length === 0
                ) {
                  replyMessage = [
                    { type: "text", text: "目前沒有本日待辦事項。" },
                  ];
                  break;
                } else {
                  // 建立 Flex Message
                  const pendingTodayFlexMessage =
                    pendingTodayTodos.length !== 0
                      ? {
                          type: "flex",
                          altText: "本日待辦事項列表",
                          contents: {
                            type: "carousel", // 使用 carousel 顯示多個項目
                            contents: pendingTodayTodos.map((todo) => ({
                              type: "bubble",
                              body: {
                                type: "box",
                                layout: "vertical",
                                spacing: "sm",
                                contents: [
                                  {
                                    type: "text",
                                    text: todo.title,
                                    weight: "bold",
                                    size: "lg",
                                    color: "#333333",
                                  },
                                  {
                                    type: "text",
                                    text: `日期：${new Date(
                                      todo.createdAt
                                    ).toLocaleDateString()}`,
                                    size: "sm",
                                    color: "#999999",
                                  },
                                  {
                                    type: "text",
                                    text: `狀態：${todo.status}`,
                                    size: "sm",
                                    color: "#999999",
                                  },
                                  {
                                    type: "button",
                                    action: {
                                      type: "message",
                                      label: "完成",
                                      text: `完成 ${todo._id}`,
                                    },
                                    style: "primary",
                                    color: "#28a745", // 綠色按鈕
                                  },
                                ],
                              },
                            })),
                          },
                        }
                      : { type: "text", text: "目前沒有本日待辦事項。" };
                  const completedTodayFlexMessage =
                    completedTodayTodos.length !== 0
                      ? {
                          type: "flex",
                          altText: "本日已完成事項列表",
                          contents: {
                            type: "carousel", // 使用 carousel 顯示多個項目
                            contents: completedTodayTodos.map((todo) => ({
                              type: "bubble",
                              body: {
                                type: "box",
                                layout: "vertical",
                                spacing: "sm",
                                contents: [
                                  {
                                    type: "text",
                                    text: todo.title,
                                    weight: "bold",
                                    size: "lg",
                                    color: "#333333",
                                  },
                                  {
                                    type: "text",
                                    text: `日期：${new Date(
                                      todo.createdAt
                                    ).toLocaleDateString()}`,
                                    size: "sm",
                                    color: "#999999",
                                  },
                                  {
                                    type: "text",
                                    text: `狀態：${todo.status}`,
                                    size: "sm",
                                    color: "#999999",
                                  },
                                ],
                              },
                            })),
                          },
                        }
                      : { type: "text", text: "目前沒有本日已完成事項。" };

                  // 回傳 Flex Message
                  await replyToLine(replyToken, [
                    pendingTodayFlexMessage,
                    completedTodayFlexMessage,
                  ]);
                  break;
                }

              case "本週":
                function getWeekRange() {
                  const weekToday = new Date();

                  // 調整時間為 UTC+8 時區
                  weekToday.setHours(weekToday.getHours() + 8);

                  // 計算本週的週一
                  const dayOfWeek = weekToday.getUTCDay(); // 取得今天是星期幾 (0 表示星期日)
                  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 偏移量，如果是週日則偏移 -6
                  const startOfWeek = new Date(weekToday);
                  startOfWeek.setUTCDate(weekToday.getUTCDate() + mondayOffset);
                  startOfWeek.setUTCHours(0, 0, 0, 0); // 設置為當日的 00:00

                  // 計算本週的週日
                  const endOfWeek = new Date(startOfWeek);
                  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
                  endOfWeek.setUTCHours(23, 59, 59, 999); // 設置為當日的 23:59:59.999

                  return { startOfWeek, endOfWeek };
                }

                const { startOfWeek, endOfWeek } = getWeekRange();

                // 查詢本週待辦事項
                const pendingWeekTodos = await todoModel
                  .find({
                    userId,
                    status: "尚未完成",
                    createdAt: {
                      $gte: startOfWeek,
                      $lt: endOfWeek,
                    },
                  })
                  .sort({ createdAt: "asc" });

                // 查詢已完成事項
                const completedWeekTodos = await todoModel
                  .find({
                    userId,
                    status: "完成",
                    createdAt: {
                      $gte: startOfWeek,
                      $lt: endOfWeek,
                    },
                  })
                  .sort({ createdAt: "asc" });

                if (
                  pendingWeekTodos.length === 0 &&
                  completedWeekTodos.length === 0
                ) {
                  replyMessage = [
                    { type: "text", text: "目前沒有本週待辦事項。" },
                  ];
                  break;
                } else {
                  // 建立 Flex Message
                  const pendingWeekFlexMessage =
                    pendingWeekTodos.length !== 0
                      ? {
                          type: "flex",
                          altText: "本週待辦事項列表",
                          contents: {
                            type: "carousel", // 使用 carousel 顯示多個項目
                            contents: pendingWeekTodos.map((todo) => ({
                              type: "bubble",
                              body: {
                                type: "box",
                                layout: "vertical",
                                spacing: "sm",
                                contents:
                                  todo.status === "尚未完成"
                                    ? [
                                        {
                                          type: "text",
                                          text: todo.title,
                                          weight: "bold",
                                          size: "lg",
                                          color: "#333333",
                                        },
                                        {
                                          type: "text",
                                          text: `日期：${new Date(
                                            todo.createdAt
                                          ).toLocaleDateString()}`,
                                          size: "sm",
                                          color: "#999999",
                                        },
                                        {
                                          type: "text",
                                          text: `狀態：${todo.status}`,
                                          size: "sm",
                                          color: "#999999",
                                        },
                                        {
                                          type: "button",
                                          action: {
                                            type: "message",
                                            label: "完成",
                                            text: `完成 ${todo._id}`,
                                          },
                                          style: "primary",
                                          color: "#28a745", // 綠色按鈕
                                        },
                                      ]
                                    : [
                                        {
                                          type: "text",
                                          text: todo.title,
                                          weight: "bold",
                                          size: "lg",
                                          color: "#333333",
                                        },
                                        {
                                          type: "text",
                                          text: `日期：${new Date(
                                            todo.createdAt
                                          ).toLocaleDateString()}`,
                                          size: "sm",
                                          color: "#999999",
                                        },
                                        {
                                          type: "text",
                                          text: `狀態：${todo.status}`,
                                          size: "sm",
                                          color: "#999999",
                                        },
                                      ],
                              },
                            })),
                          },
                        }
                      : { type: "text", text: "目前沒有本週待辦事項。" };

                  const completedWeekFlexMessage =
                    completedWeekTodos.length !== 0
                      ? {
                          type: "flex",
                          altText: "本週已完成事項列表",
                          contents: {
                            type: "carousel", // 使用 carousel 顯示多個項目
                            contents: completedWeekTodos.map((todo) => ({
                              type: "bubble",
                              body: {
                                type: "box",
                                layout: "vertical",
                                spacing: "sm",
                                contents: [
                                  {
                                    type: "text",
                                    text: todo.title,
                                    weight: "bold",
                                    size: "lg",
                                    color: "#333333",
                                  },
                                  {
                                    type: "text",
                                    text: `日期：${new Date(
                                      todo.createdAt
                                    ).toLocaleDateString()}`,
                                    size: "sm",
                                    color: "#999999",
                                  },
                                  {
                                    type: "text",
                                    text: `狀態：${todo.status}`,
                                    size: "sm",
                                    color: "#999999",
                                  },
                                ],
                              },
                            })),
                          },
                        }
                      : { type: "text", text: "目前沒有本週已完成事項。" };

                  // 回傳 Flex Message
                  await replyToLine(replyToken, [
                    pendingWeekFlexMessage,
                    completedWeekFlexMessage,
                  ]);
                  break;
                }

              case "本月":
                const month = new Date().getMonth() + 1;

                // 設置本月的起始時間
                const startOfMonth = new Date(
                  new Date().getFullYear(),
                  month - 1,
                  1
                );

                // 設置本月的結束時間
                const endOfMonth = new Date(new Date().getFullYear(), month, 0);

                // 查詢本月待辦事項
                const pendingMonthTodos = await todoModel
                  .find({
                    userId,
                    status: "尚未完成",
                    createdAt: {
                      $gte: startOfMonth,
                      $lt: endOfMonth,
                    },
                  })
                  .sort({ createdAt: "asc" });

                // 查詢已完成事項
                const completedMonthTodos = await todoModel
                  .find({
                    userId,
                    status: "完成",
                    createdAt: {
                      $gte: startOfMonth,
                      $lt: endOfMonth,
                    },
                  })
                  .sort({ createdAt: "asc" });

                if (
                  pendingMonthTodos.length === 0 &&
                  completedMonthTodos.length === 0
                ) {
                  replyMessage = [
                    { type: "text", text: `找不到 ${month} 的待辦事項。` },
                  ];
                  break;
                } else {
                  // 建立 Flex Message
                  const pendingMonthFlexMessage =
                    pendingMonthTodos.length !== 0
                      ? {
                          type: "flex",
                          altText: "本月待辦事項列表",
                          contents: {
                            type: "carousel", // 使用 carousel 顯示多個項目
                            contents: pendingMonthTodos.map((todo) => ({
                              type: "bubble",
                              body: {
                                type: "box",
                                layout: "vertical",
                                spacing: "sm",
                                contents: [
                                  {
                                    type: "text",
                                    text: todo.title,
                                    weight: "bold",
                                    size: "lg",
                                    color: "#333333",
                                  },
                                  {
                                    type: "text",
                                    text: `日期：${new Date(
                                      todo.createdAt
                                    ).toLocaleDateString()}`,
                                    size: "sm",
                                    color: "#999999",
                                  },
                                  {
                                    type: "text",
                                    text: `狀態：${todo.status}`,
                                    size: "sm",
                                    color: "#999999",
                                  },
                                  {
                                    type: "button",
                                    action: {
                                      type: "message",
                                      label: "完成",
                                      text: `完成 ${todo._id}`,
                                    },
                                    style: "primary",
                                    color: "#28a745", // 綠色按鈕
                                  },
                                  {
                                    type: "button",
                                    action: {
                                      type: "message",
                                      label: "刪除",
                                      text: `刪除 ${todo._id}`,
                                    },
                                    style: "primary",
                                    color: "#dc3545", // 紅色按鈕
                                  },
                                ],
                              },
                            })),
                          },
                        }
                      : { type: "text", text: `找不到 ${month} 的待辦事項。` };

                  const completedMonthFlexMessage =
                    completedMonthTodos.length !== 0
                      ? {
                          type: "flex",
                          altText: "本月已完成事項列表",
                          contents: {
                            type: "carousel", // 使用 carousel 顯示多個項目
                            contents: completedMonthTodos.map((todo) => ({
                              type: "bubble",
                              body: {
                                type: "box",
                                layout: "vertical",
                                spacing: "sm",
                                contents: [
                                  {
                                    type: "text",
                                    text: todo.title,
                                    weight: "bold",
                                    size: "lg",
                                    color: "#333333",
                                  },
                                  {
                                    type: "text",
                                    text: `日期：${new Date(
                                      todo.createdAt
                                    ).toLocaleDateString()}`,
                                    size: "sm",
                                    color: "#999999",
                                  },
                                  {
                                    type: "text",
                                    text: `狀態：${todo.status}`,
                                    size: "sm",
                                    color: "#999999",
                                  },
                                ],
                              },
                            })),
                          },
                        }
                      : {
                          type: "text",
                          text: `找不到 ${month}月 的已完成事項。`,
                        };

                  // 回傳 Flex Message
                  await replyToLine(replyToken, [
                    pendingMonthFlexMessage,
                    completedMonthFlexMessage,
                  ]);
                  break;
                }

              default:
                replyMessage = [
                  {
                    type: "text",
                    text: "無法識別的指令。請使用「新增」「查看」「完成」等指令。",
                  },
                ];
            }
          }

          // 判斷文字中是否有「完成」關鍵字
          const hasCompleteKeyword =
            message.text.includes("完成") &&
            message.text !== "已完成" &&
            message.text !== "未完成";
          if (hasCompleteKeyword) {
            // 回覆用戶
            // 從 message.text 排除 完成 二字，取出待辦事項 ID
            const todoId = message.text.replace("完成", "").trim();
            const todo = await todoModel.findByIdAndUpdate(
              todoId,
              { status: "完成" },
              { new: true }
            );
            if (todo) {
              replyMessage = [
                { type: "text", text: `待辦事項「${todo.title}」已標記完成！` },
              ];
            } else {
              replyMessage = [
                { type: "text", text: `找不到 ID 為 ${todoId} 的待辦事項。` },
              ];
            }
          }

          // 判斷文字中是否有「刪除」關鍵字
          const hasDeleteKeyword = message.text.includes("刪除");
          if (hasDeleteKeyword) {
            // 回覆用戶
            // 從 message.text 排除 刪除 二字，取出待辦事項 ID
            const todoId = message.text.replace("刪除", "").trim();
            const todo = await todoModel.findByIdAndDelete(todoId);
            if (todo) {
              replyMessage = [
                { type: "text", text: `待辦事項「${todo.title}」已刪除！` },
              ];
            } else {
              replyMessage = [
                { type: "text", text: `找不到 ID 為 ${todoId} 的待辦事項。` },
              ];
            }
          }

          // 回覆用戶
          await replyToLine(replyToken, replyMessage);
        }
      }
    }

    return new NextResponse(JSON.stringify({ message: "Hello" }), {
      status: 200,
    });
  } catch (e) {
    console.log("e", e);
    return new Response(
      JSON.stringify({ message: "Error connecting to the database" }),
      {
        status: 500,
      }
    );
  }
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
