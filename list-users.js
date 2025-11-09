const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true
    }
  });

  console.log(`Found ${users.length} user(s):`);
  users.forEach((user, index) => {
    console.log(`\n${index + 1}. ${user.email}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Created: ${user.createdAt}`);
  });

  if (users.length === 0) {
    console.log('No users found. You need to register first!');
  }

  await prisma.$disconnect();
}

listUsers();
