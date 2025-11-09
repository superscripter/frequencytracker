const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
  const user = await prisma.user.findUnique({
    where: { email: 'josloff.bryan@gmail.com' }
  });

  if (user) {
    console.log('User found:');
    console.log(JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
      createdAt: user.createdAt
    }, null, 2));
  } else {
    console.log('User not found');
  }

  await prisma.$disconnect();
}

checkUser();
