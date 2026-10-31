#!/usr/bin/env node
/*
  Writes the migration that creates the first admin account.

  The platform has no way to open a shell inside the running app, so
  `admin-user.js create` — which is what made this account before — cannot be
  reached there. The account has to arrive the same way every other change to
  the database does: as a reviewed .sql file.

  The password is hashed here, on the machine of whoever runs this, and only
  the hash is written. The plain password never goes into the repository, the
  image or anyone's terminal history beyond this one invocation.

  Usage:
    node scripts/make-admin-migration.js owner@example.com
    node scripts/make-admin-migration.js owner@example.com 'mat-khau-rat-dai'
    node scripts/make-admin-migration.js --print owner@example.com

  Omit the password and a strong one is generated and printed once.

  `--print` writes the statement to stdout instead of to a file, for pasting
  into a database console. Creating the account is a row insert, not a schema
  change, so the role the app connects with is allowed to do it — and done
  this way the password hash never enters the repository, where it would
  survive in the history long after the password itself was changed.
*/
const { randomUUID, randomBytes } = require('node:crypto');
const { readdirSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');
const bcrypt = require('bcryptjs');

// Same cost as admin-user.js, so a password set here and one set later from
// inside the admin are indistinguishable to the login code.
const ROUNDS = 10;

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

function nextNumber() {
  const used = readdirSync(MIGRATIONS_DIR)
    .map((f) => Number(f.slice(0, 4)))
    .filter((n) => Number.isInteger(n));
  return String(Math.max(0, ...used) + 1).padStart(4, '0');
}

// Single quotes are the only thing that could break out of the literals below.
const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

async function main() {
  const args = process.argv.slice(2);
  const printOnly = args[0] === '--print';
  if (printOnly) args.shift();

  const email = args[0];
  if (!email || !email.includes('@')) {
    console.error('Cần email. Ví dụ: node scripts/make-admin-migration.js owner@example.com');
    process.exit(1);
  }

  const generated = !args[1];
  const password = args[1] ?? randomBytes(12).toString('base64url');
  if (password.length < 8) {
    console.error('Mật khẩu cần ít nhất 8 ký tự.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, ROUNDS);
  const sql = `-- Tài khoản quản trị đầu tiên.
-- Chỉ chứa mật khẩu đã băm (bcrypt, ${ROUNDS} vòng). Mật khẩu gốc không nằm ở đây.
-- Chạy được nhiều lần: đã có email này thì không làm gì.
INSERT INTO "admin_users" ("id", "email", "passwordHash", "createdAt", "updatedAt")
VALUES (${sqlString(randomUUID())}, ${sqlString(email)}, ${sqlString(hash)}, NOW(), NOW())
ON CONFLICT ("email") DO NOTHING;
`;

  if (printOnly) {
    console.log(sql);
  } else {
    mkdirSync(MIGRATIONS_DIR, { recursive: true });
    const file = join(MIGRATIONS_DIR, `${nextNumber()}_admin_user.sql`);
    writeFileSync(file, sql);
    console.log(`Đã ghi ${file}`);
  }

  console.log(`Email    : ${email}`);
  if (generated) {
    console.log(`Mật khẩu : ${password}`);
    console.log('\nLưu mật khẩu này ngay — nó không hiện lại lần nào nữa.');
  }
  console.log('Đăng nhập xong hãy đổi mật khẩu trong mục Tài khoản.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
