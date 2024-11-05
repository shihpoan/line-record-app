// utils/redis.js
import Redis from "ioredis";

const redis = new Redis({
  host: "localhost", // Redis 伺服器的主機名
  port: 6379, // Redis 伺服器的端口
  //   password: "your_redis_password", // 若 Redis 設有密碼則添加
});

export default redis;
