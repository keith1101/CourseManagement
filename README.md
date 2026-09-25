# Course Management API

**REST API cho hệ thống học tập và kiểm tra trực tuyến**, xây dựng bằng NestJS, TypeScript, PostgreSQL và Prisma. Hệ thống hỗ trợ quản trị nội dung, giao đề thi, làm bài có giới hạn thời gian và phân quyền học sinh.

![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white) ![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)

## Tính năng

- **Tài khoản & bảo mật:** đăng ký, xác minh email, đăng nhập JWT, đổi mật khẩu và phân quyền `ADMIN` / `STUDENT`.
- **Quản lý học tập:** môn học, tài liệu PDF/DOCX/video, tài khoản `FREE` / `PRO` và nội dung được xuất bản theo quyền truy cập.
- **Ngân hàng đề thi:** tạo và xuất bản đề, câu hỏi trắc nghiệm, trả lời ngắn hoặc nhiều ý; hỗ trợ hình ảnh, gợi ý và giải thích.
- **Giao bài & chấm điểm:** giao đề theo hạn nộp, lưu câu trả lời, nộp bài và xem kết quả.
- **Luồng làm bài tuần tự (v2):** thời gian riêng cho mỗi câu, trạng thái tiến độ do server quản lý và chống gửi trùng bằng `Idempotency-Key`.
- **Lưu trữ riêng tư:** upload tài liệu và ảnh lên Cloudflare R2; tải về qua signed URL có thời hạn.

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Backend | NestJS 11, TypeScript 5, REST API |
| Database | PostgreSQL, Prisma ORM 7 |
| Authentication | JWT, Passport, bcrypt, email verification |
| Object storage | Cloudflare R2 (S3-compatible) |
| Testing | Jest, Supertest |
| Tooling | pnpm, Docker Compose |

## Chạy trên máy cá nhân

**Yêu cầu:** Node.js tương thích với Prisma 7, pnpm và Docker (hoặc một PostgreSQL instance có sẵn).

**1. Clone và cài đặt**

```bash
git clone https://github.com/keith1101/CourseManagement.git
cd CourseManagement
pnpm install
cp .env.example .env
```

Trên PowerShell, dùng `Copy-Item .env.example .env` thay cho `cp` nếu cần.

**2. Cấu hình `.env` cho PostgreSQL local**

```dotenv
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/course_management_db?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
JWT_EXPIRES_IN="1d"
PORT=5001
EMAIL_PROVIDER="console"
SEQUENTIAL_EXAM_FLOW_ENABLED=false
```

Đây chỉ là thông tin database mẫu trong `docker-compose.yml` dành cho local. Điền các biến còn lại trong [`.env.example`](./.env.example) khi dùng R2 hoặc Gmail API. Không commit `.env` hoặc thông tin xác thực thật.

**3. Khởi động database và API**

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm db:generate
pnpm dev
```

API mặc định chạy tại **`http://localhost:5001/api`**. Kiểm tra kết nối: `GET /api/health` (trả về trạng thái API và database).

Khi dùng `EMAIL_PROVIDER=console` trong môi trường development, đường dẫn xác minh email được ghi vào log backend. Môi trường production cần cấu hình nhà cung cấp email thực.

## API chính

| Nhóm | Endpoint tiêu biểu |
| --- | --- |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Users | `GET /api/users`, `PATCH /api/users/:id` |
| Subjects | `GET /api/subjects`, `POST /api/subjects` |
| Materials | `POST /api/materials/upload`, `GET /api/materials/:id/download` |
| Exams | `POST /api/exams`, `PATCH /api/exams/:id/publish` |
| Questions | `POST /api/exams/:examId/questions`, `GET /api/exams/:examId/questions` |
| Assignments | `POST /api/assignments`, `GET /api/assignments` |
| Attempts | `POST /api/exams/:examId/attempts`, `GET /api/attempts/:id/result` |

Các API nghiệp vụ yêu cầu Bearer token và kiểm tra quyền theo vai trò. Xem [API reference](./docs/API_REFERENCE.md) để biết danh sách endpoint và hành vi chi tiết.

### Chế độ làm bài tuần tự

Đặt `SEQUENTIAL_EXAM_FLOW_ENABLED=true` để **những lượt làm bài mới** sử dụng luồng v2. Client lấy câu hiện tại qua `GET /api/attempts/:id/session`, sau đó gọi các endpoint `current-question/submit`, `expire` và `continue`. Hai thao tác `submit` và `continue` yêu cầu header `Idempotency-Key`; các lượt làm bài cũ vẫn giữ luồng v1.

## Cấu hình dịch vụ bổ sung

- **Cloudflare R2:** điền `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`; `R2_SIGNED_URL_TTL_SECONDS` mặc định là 900 giây.
- **Gmail API:** đặt `EMAIL_PROVIDER=gmail` và cấu hình `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER_EMAIL`.
- **CORS:** dùng `FRONTEND_URL` để thêm origin của frontend (có thể khai báo nhiều origin, ngăn cách bằng dấu phẩy).

## Kiểm thử và build

```bash
pnpm test             # Unit tests
pnpm test:cov         # Coverage
pnpm build            # Production build
pnpm db:deploy        # Áp dụng migrations đã có khi deploy
```

Integration tests (`pnpm test:integration`) phải dùng **PostgreSQL test riêng có thể xóa bỏ**, đặt `TEST_DATABASE_URL` và chạy migrations cho database đó trước khi test. Chỉ chạy `pnpm db:seed` trên môi trường dev/test sau khi cấu hình `ALLOW_TEST_SEED` cùng các mật khẩu test.

Tài liệu kiểm thử: [Test plan](./docs/testing/TEST_PLAN.md) · [Smoke test](./docs/testing/SMOKE_TEST.md) · [Báo cáo kiểm thử ngày 02/09/2026](./docs/testing/TEST_REPORT.md). Báo cáo là kết quả tại thời điểm được ghi, không phản ánh trạng thái kiểm thử hiện tại.

## Cấu trúc dự án

```text
src/
├── auth/                  # JWT, xác minh email
├── users/                 # Quản lý tài khoản và quyền truy cập
├── subjects/              # Môn học
├── materials/             # Tài liệu và media
├── exams/                 # Đề thi
├── questions/             # Câu hỏi và đáp án
├── assignments/           # Giao đề và hạn nộp
├── attempts/              # Làm bài, chấm điểm, kết quả
├── storage/               # Cloudflare R2
└── prisma/                # Prisma service
prisma/                    # Schema, migrations và seed
docs/                      # API reference và tài liệu kiểm thử
```

**Frontend:** [CourseManagement_FE](https://github.com/keith1101/CourseManagement_FE).
