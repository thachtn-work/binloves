-- Tài khoản quản trị đầu tiên.
-- Chỉ chứa mật khẩu đã băm (bcrypt, 10 vòng). Mật khẩu gốc không nằm ở đây.
-- Chạy được nhiều lần: đã có email này thì không làm gì.
INSERT INTO "admin_users" ("id", "email", "passwordHash", "createdAt", "updatedAt")
VALUES ('d200a102-179e-4b3e-9980-1de75081aada', 'owner@binloves.io.vn', '$2a$10$/6KAPLIcUWjFzn1656CVEO8u8ml9FaG3Ms4QOdlizpSVylLusWlCy', NOW(), NOW())
ON CONFLICT ("email") DO NOTHING;
