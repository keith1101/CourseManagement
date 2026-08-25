# Course Management API

NestJS + TypeScript + PostgreSQL + Prisma API.

## Stack

- NestJS
- TypeScript
- PostgreSQL
- Prisma ORM
- pnpm

## Cài đặt và cấu hình

Yêu cầu: Node.js, pnpm, PostgreSQL và Docker nếu sử dụng database local đi kèm project.

```bash
pnpm install
cp .env.example .env
```

Sau khi sao chép, thay các placeholder trong `.env` bằng cấu hình của môi trường đang chạy. Không commit `.env` hoặc JWT secret thật lên Git.

Các biến bắt buộc được mô tả trong [`.env.example`](./.env.example):

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: chuỗi bí mật dài, ngẫu nhiên.
- `JWT_EXPIRES_IN`: thời hạn access token, ví dụ `1d`.
- `PORT`: cổng HTTP, mặc định trong file mẫu là `5001`.

## Chạy local

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

API mặc định chạy tại `http://localhost:5001/api`. Tất cả endpoint bên dưới đã bao gồm prefix `/api`.

## Các lệnh thường dùng

```bash
# Cài dependencies
pnpm install

# Tạo Prisma Client và áp dụng migration trong môi trường development
pnpm db:generate
pnpm db:migrate

# Chạy development server
pnpm dev

# Chạy unit test
pnpm test

# Build production
pnpm build

# Áp dụng migration đã có trong production, sau đó khởi động app
pnpm db:deploy
pnpm start:prod
```

`pnpm db:migrate` dành cho development. Khi deploy production, dùng `pnpm db:deploy` để chỉ áp dụng các migration đã được tạo và kiểm tra.


# Thiết kế API

## 1. Auth Module

Auth module xử lý đăng ký, đăng nhập, xác thực người dùng và quản lý mật khẩu.

| Method | Endpoint                | Mô tả                                   | Quyền         | Trạng thái |
| ------ | ----------------------- | --------------------------------------- | ------------- | ---------- |
| POST   | `/api/auth/register`        | Đăng ký tài khoản học sinh              | Public        | Done       |
| POST   | `/api/auth/login`           | Đăng nhập và nhận access token          | Public        | Done       |
| GET    | `/api/auth/me`              | Lấy thông tin người dùng đang đăng nhập | Student/Admin | Done       |
| PATCH  | `/api/auth/change-password` | Đổi mật khẩu                            | Student/Admin | Done       |

## 2. Users Module

Users module cho phép Admin quản lý tài khoản học sinh.

| Method | Endpoint            | Mô tả                         | Quyền | Trạng thái |
| ------ | ------------------- | ----------------------------- | ----- | ---------- |
| GET    | `/api/users`            | Lấy danh sách học sinh        | Admin | Done       |
| GET    | `/api/users/:id`        | Xem chi tiết học sinh         | Admin | Done       |
| PATCH  | `/api/users/:id`        | Cập nhật thông tin học sinh   | Admin | Done       |
| PATCH  | `/api/users/:id/lock`   | Khóa tài khoản                | Admin | Done       |
| PATCH  | `/api/users/:id/unlock` | Mở khóa tài khoản             | Admin | Done       |
| PATCH  | `/api/users/:id/pro`    | Chuyển tài khoản sang Pro     | Admin | Done       |
| PATCH  | `/api/users/:id/free`   | Chuyển tài khoản về Free      | Admin | Done       |

Hỗ trợ tìm kiếm học sinh:

`GET /api/users?search=...`

Ghi chú: Hàm tìm học sinh theo email được sử dụng nội bộ cho Auth module, không cần tạo endpoint riêng để tránh làm lộ email người dùng. Response Users không chứa `passwordHash`.

## 3. Subjects Module

Subjects module quản lý danh sách môn học trong hệ thống.

Các môn học mặc định:

* Toán
* KHTN
* Lịch sử
* Địa lý
* Tiếng Anh
* Tiếng Việt

| Method | Endpoint        | Mô tả                 | Quyền         | Trạng thái |
| ------ | --------------- | --------------------- | ------------- | ---------- |
| GET    | `/api/subjects`     | Lấy danh sách môn học | Student/Admin | Done       |
| GET    | `/api/subjects/:id` | Xem chi tiết môn học  | Student/Admin | Done       |
| POST   | `/api/subjects`     | Tạo môn học           | Admin         | Done       |
| PATCH  | `/api/subjects/:id` | Cập nhật môn học      | Admin         | Done       |
| DELETE | `/api/subjects/:id` | Xóa mềm môn học       | Admin         | Done       |

## 4. Documents Module

Documents module quản lý tài liệu học tập như PDF, DOCX, video và video nhúng.

| Method | Endpoint         | Mô tả                       | Quyền         | Trạng thái |
| ------ | ---------------- | --------------------------- | ------------- | ---------- |
| POST   | `/api/documents`     | Thêm hoặc upload tài liệu   | Admin         | Planned    |
| GET    | `/api/documents`     | Lấy danh sách tài liệu      | Student/Admin | Planned    |
| GET    | `/api/documents/:id` | Xem chi tiết tài liệu       | Student/Admin | Planned    |
| PATCH  | `/api/documents/:id` | Cập nhật thông tin tài liệu | Admin         | Planned    |
| DELETE | `/api/documents/:id` | Xóa tài liệu                | Admin         | Planned    |

Ghi chú: Học sinh chỉ xem tài liệu online, không tải trực tiếp.

## 5. Exams Module

Exams module quản lý đề thi.

Đề thi hỗ trợ các trạng thái:

* DRAFT
* PUBLISHED

| Method | Endpoint               | Mô tả                              | Quyền         | Trạng thái |
| ------ | ---------------------- | ---------------------------------- | ------------- | ---------- |
| POST   | `/api/exams`               | Tạo đề thi                         | Admin         | Planned    |
| GET    | `/api/exams`               | Lấy danh sách đề thi               | Student/Admin | Planned    |
| GET    | `/api/exams/:id`           | Xem chi tiết đề thi                | Student/Admin | Planned    |
| PATCH  | `/api/exams/:id`           | Cập nhật đề thi                    | Admin         | Planned    |
| DELETE | `/api/exams/:id`           | Xóa đề thi                         | Admin         | Planned    |
| PATCH  | `/api/exams/:id/publish`   | Công khai đề thi                   | Admin         | Planned    |
| PATCH  | `/api/exams/:id/unpublish` | Chuyển đề thi về trạng thái Draft | Admin         | Planned    |

Hỗ trợ lọc đề thi theo trạng thái:

`GET /api/exams?status=PUBLISHED`

`GET /api/exams?status=DRAFT`

## 6. Questions Module

Questions module quản lý câu hỏi trong đề thi.

| Method | Endpoint                   | Mô tả                        | Quyền         | Trạng thái |
| ------ | -------------------------- | ---------------------------- | ------------- | ---------- |
| GET    | `/api/exams/:examId/questions` | Lấy danh sách câu hỏi của đề | Student/Admin | Done       |
| POST   | `/api/exams/:examId/questions` | Thêm câu hỏi vào đề thi      | Admin         | Done       |
| GET    | `/api/questions/:id`           | Xem chi tiết câu hỏi         | Student/Admin | Done       |
| PATCH  | `/api/questions/:id`           | Cập nhật câu hỏi             | Admin         | Done       |
| PATCH  | `/api/questions/:id/order`     | Thay đổi thứ tự câu hỏi      | Admin         | Done       |
| DELETE | `/api/questions/:id`           | Xóa câu hỏi                  | Admin         | Done       |
| POST   | `/api/questions/:id/options`   | Thêm đáp án                  | Admin         | Done       |
| PATCH  | `/api/questions/options/:optionId` | Cập nhật đáp án           | Admin         | Done       |
| DELETE | `/api/questions/options/:optionId` | Xóa đáp án                | Admin         | Done       |

Câu hỏi hỗ trợ:

* Trắc nghiệm A/B/C/D
* Tự luận
* Hình ảnh
* Đáp án đúng
* Giải thích
* Hướng dẫn
* Thời gian riêng cho từng câu

Ghi chú: Khi học sinh xem câu hỏi, hệ thống không trả về đáp án đúng trước thời điểm cho phép.

## 7. Assignments Module

Assignments module cho phép Admin giao đề thi cho học sinh.

| Method | Endpoint           | Mô tả                            | Quyền         | Trạng thái |
| ------ | ------------------ | -------------------------------- | ------------- | ---------- |
| POST   | `/api/assignments`     | Giao đề thi cho học sinh         | Admin         | Done       |
| GET    | `/api/assignments`     | Xem danh sách đề được giao       | Student/Admin | Done       |
| GET    | `/api/assignments/:id` | Xem chi tiết assignment          | Student/Admin | Done       |
| PATCH  | `/api/assignments/:id` | Cập nhật deadline hoặc thông tin | Admin         | Done       |
| DELETE | `/api/assignments/:id` | Hủy assignment                   | Admin         | Done       |

Hỗ trợ lọc assignment theo học sinh:

`GET /api/assignments?userId=123`

Hỗ trợ lọc assignment theo trạng thái:

`GET /api/assignments?status=OVERDUE`

Các trạng thái có thể sử dụng:

* PENDING
* IN_PROGRESS
* COMPLETED
* OVERDUE

## 8. Attempts / Submissions Module

Attempts module xử lý quá trình làm bài, lưu câu trả lời, nộp bài và xem kết quả.

| Method | Endpoint                  | Mô tả                        | Quyền         | Trạng thái |
| ------ | ------------------------- | ---------------------------- | ------------- | ---------- |
| POST   | `/api/exams/:examId/attempts` | Bắt đầu làm bài              | Student       | Done       |
| GET    | `/api/attempts`               | Xem lịch sử làm bài          | Student/Admin | Done       |
| GET    | `/api/attempts/:id`           | Xem chi tiết một lần làm bài | Student/Admin | Done       |
| POST   | `/api/attempts/:id/answers`   | Gửi hoặc lưu câu trả lời     | Student       | Done       |
| POST   | `/api/attempts/:id/submit`    | Nộp bài                      | Student       | Done       |
| GET    | `/api/attempts/:id/result`    | Xem kết quả bài làm          | Student/Admin | Done       |

Ghi chú: Mỗi câu hỏi có thời gian riêng. Câu hỏi `SHORT_ANSWER` lưu `selectedOptionId = null`; câu hỏi trắc nghiệm chỉ chấp nhận option thuộc chính câu hỏi đó.

Nếu học sinh trả lời sai hoặc hết giờ, hệ thống có thể hiển thị:

* Đáp án đúng
* Giải thích
* Hướng dẫn

## Thứ tự triển khai

1. Auth
2. Users
3. Subjects
4. Documents
5. Exams
6. Questions
7. Assignments
8. Attempts / Submissions
