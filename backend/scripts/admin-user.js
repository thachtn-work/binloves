// Admin account management, run on demand — never automatically.
//
// An earlier version of this seeded an account from ADMIN_EMAIL/ADMIN_PASSWORD
// on every container start, using an upsert. That quietly undid the owner's
// own password change on the next restart, so the seeding was removed and
// replaced by these explicit commands.
//
//   node scripts/admin-user.js list
//   node scripts/admin-user.js create <email> [password]
//   node scripts/admin-user.js reset  <email> [password]
//   node scripts/admin-user.js rename <email-cũ> <email-mới>
//   node scripts/admin-user.js delete <email>
//
// Omit the password and a strong one is generated and printed once.
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomBytes } = require('node:crypto');

const prisma = new PrismaClient();

function generatePassword() {
  // Base64 minus the characters that are easy to misread aloud or in a chat.
  return randomBytes(18).toString('base64').replace(/[+/=lIO0]/g, '').slice(0, 16);
}

function requireEmail(email) {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`Email không hợp lệ: ${email ?? '(trống)'}`);
  }
  return email.toLowerCase();
}

function requirePassword(password) {
  if (password && password.length < 8) {
    throw new Error('Mật khẩu phải có ít nhất 8 ký tự');
  }
  return password || generatePassword();
}

async function list() {
  const users = await prisma.adminUser.findMany({
    orderBy: { createdAt: 'asc' },
    select: { email: true, createdAt: true, updatedAt: true },
  });
  if (users.length === 0) {
    console.log('Chưa có tài khoản quản trị nào.');
    return;
  }
  console.log(`${users.length} tài khoản:`);
  for (const u of users) {
    console.log(`  ${u.email}  (tạo ${u.createdAt.toISOString().slice(0, 10)}, sửa lần cuối ${u.updatedAt.toISOString().slice(0, 10)})`);
  }
}

async function create(emailArg, passwordArg) {
  const email = requireEmail(emailArg);
  const password = requirePassword(passwordArg);

  // Deliberately not an upsert: creating an account must never silently
  // overwrite an existing one's password.
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    throw new Error(`Tài khoản ${email} đã tồn tại. Dùng lệnh "reset" nếu muốn đổi mật khẩu.`);
  }

  await prisma.adminUser.create({
    data: { email, passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`Đã tạo tài khoản.\n  email:    ${email}\n  mật khẩu: ${password}`);
  console.log('\nMật khẩu chỉ hiện lần này. Gửi cho chủ shop và nhắc họ đổi sau khi đăng nhập.');
}

async function reset(emailArg, passwordArg) {
  const email = requireEmail(emailArg);
  const password = requirePassword(passwordArg);

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (!existing) {
    throw new Error(`Không tìm thấy tài khoản ${email}. Dùng lệnh "create" để tạo mới.`);
  }

  await prisma.adminUser.update({
    where: { email },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`Đã đổi mật khẩu.\n  email:    ${email}\n  mật khẩu: ${password}`);
}

async function remove(emailArg) {
  const email = requireEmail(emailArg);
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (!existing) throw new Error(`Không tìm thấy tài khoản ${email}.`);

  // There is no public signup and no password reset by email, so deleting the
  // last account would lock everyone out of the shop permanently.
  const total = await prisma.adminUser.count();
  if (total <= 1) {
    throw new Error(
      'Đây là tài khoản quản trị duy nhất. Tạo tài khoản khác trước rồi mới xoá tài khoản này.',
    );
  }

  await prisma.adminUser.delete({ where: { email } });
  console.log(`Đã xoá tài khoản ${email}. Còn lại ${total - 1} tài khoản.`);
}

async function rename(fromArg, toArg) {
  const from = requireEmail(fromArg);
  const to = requireEmail(toArg);

  const existing = await prisma.adminUser.findUnique({ where: { email: from } });
  if (!existing) throw new Error(`Không tìm thấy tài khoản ${from}.`);
  if (await prisma.adminUser.findUnique({ where: { email: to } })) {
    throw new Error(`Email ${to} đã được dùng cho tài khoản khác.`);
  }

  await prisma.adminUser.update({ where: { email: from }, data: { email: to } });
  console.log(`Đã đổi email: ${from} → ${to}\nMật khẩu giữ nguyên.`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'list':
      return list();
    case 'create':
      return create(args[0], args[1]);
    case 'reset':
      return reset(args[0], args[1]);
    case 'rename':
      return rename(args[0], args[1]);
    case 'delete':
      return remove(args[0]);
    default:
      console.log(
        'Cách dùng:\n' +
          '  node scripts/admin-user.js list\n' +
          '  node scripts/admin-user.js create <email> [mật-khẩu]\n' +
          '  node scripts/admin-user.js reset  <email> [mật-khẩu]\n' +
          '  node scripts/admin-user.js rename <email-cũ> <email-mới>\n' +
          '  node scripts/admin-user.js delete <email>',
      );
      process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(`Lỗi: ${err.message}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
