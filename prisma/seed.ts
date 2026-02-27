import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = bcrypt.hashSync("admin", 10);
  const admin = await prisma.user.upsert({
    where: { loginId: "admin" },
    update: {},
    create: {
      loginId: "admin",
      passwordHash: hash,
      name: "管理者",
      email: "admin@example.com",
      department: "1DCD",
      role: "admin",
    },
  });
  console.log("初期管理者を作成しました:", admin.loginId, "/ パスワード: admin");

  const count = await prisma.client.count();
  if (count === 0) {
    await prisma.client.createMany({
      data: [
        { name: "サンプルクライアントA", department: null, note: null },
        { name: "サンプルクライアントB", department: null, note: null },
      ],
    });
    console.log("サンプルクライアントを2件追加しました。");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
