# Course Management API

NestJS + TypeScript + PostgreSQL + Prisma API.

## Stack

- NestJS
- TypeScript
- PostgreSQL
- Prisma ORM
- pnpm

## Local setup

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

The API runs at:

```text
http://localhost:5001/api
```

## Useful commands

```bash
pnpm dev
pnpm build
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```


# Thiết kế API

## 1. Auth Module

Auth module xử lý đăng ký, đăng nhập, xác thực người dùng và quản lý mật khẩu.

| Method | Endpoint                | Mô tả                                   | Quyền         | Trạng thái |
| ------ | ----------------------- | --------------------------------------- | ------------- | ---------- |
| POST   | `/auth/register`        | Đăng ký tài khoản học sinh              | Public        | Done       |
| POST   | `/auth/login`           | Đăng nhập và nhận access token          | Public        | Done       |
| GET    | `/auth/me`              | Lấy thông tin người dùng đang đăng nhập | Student/Admin | Planned    |
| PATCH  | `/auth/change-password` | Đổi mật khẩu                            | Student/Admin | Planned    |

## 2. Users Module

Users module cho phép Admin quản lý tài khoản học sinh.

| Method | Endpoint            | Mô tả                         | Quyền | Trạng thái |
| ------ | ------------------- | ----------------------------- | ----- | ---------- |
| GET    | `/users`            | Lấy danh sách học sinh        | Admin | Planned    |
| GET    | `/users/:id`        | Xem chi tiết học sinh         | Admin | Planned    |
| PATCH  | `/users/:id`        | Cập nhật thông tin học sinh   | Admin | Planned    |
| PATCH  | `/users/:id/lock`   | Khóa tài khoản                | Admin | Planned    |
| PATCH  | `/users/:id/unlock` | Mở khóa tài khoản             | Admin | Planned    |
| PATCH  | `/users/:id/pro`    | Cập nhật tài khoản Thường/Pro | Admin | Planned    |

Hỗ trợ tìm kiếm học sinh:

`GET /users?search=...`

Ghi chú: Hàm tìm học sinh theo email được sử dụng nội bộ cho Auth module, không cần tạo endpoint riêng để tránh làm lộ email người dùng.

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
| GET    | `/subjects`     | Lấy danh sách môn học | Student/Admin | Planned    |
| GET    | `/subjects/:id` | Xem chi tiết môn học  | Student/Admin | Planned    |
| POST   | `/subjects`     | Tạo môn học           | Admin         | Planned    |
| PATCH  | `/subjects/:id` | Cập nhật môn học      | Admin         | Planned    |
| DELETE | `/subjects/:id` | Xóa môn học           | Admin         | Planned    |

## 4. Documents Module

Documents module quản lý tài liệu học tập như PDF, DOCX, video và video nhúng.

| Method | Endpoint         | Mô tả                       | Quyền         | Trạng thái |
| ------ | ---------------- | --------------------------- | ------------- | ---------- |
| POST   | `/documents`     | Thêm hoặc upload tài liệu   | Admin         | Planned    |
| GET    | `/documents`     | Lấy danh sách tài liệu      | Student/Admin | Planned    |
| GET    | `/documents/:id` | Xem chi tiết tài liệu       | Student/Admin | Planned    |
| PATCH  | `/documents/:id` | Cập nhật thông tin tài liệu | Admin         | Planned    |
| DELETE | `/documents/:id` | Xóa tài liệu                | Admin         | Planned    |

Ghi chú: Học sinh chỉ xem tài liệu online, không tải trực tiếp.

## 5. Exams Module

Exams module quản lý đề thi.

Đề thi hỗ trợ các trạng thái:

* DRAFT
* PUBLISHED

| Method | Endpoint               | Mô tả                              | Quyền         | Trạng thái |
| ------ | ---------------------- | ---------------------------------- | ------------- | ---------- |
| POST   | `/exams`               | Tạo đề thi                         | Admin         | Planned    |
| GET    | `/exams`               | Lấy danh sách đề thi               | Student/Admin | Planned    |
| GET    | `/exams/:id`           | Xem chi tiết đề thi                | Student/Admin | Planned    |
| PATCH  | `/exams/:id`           | Cập nhật đề thi                    | Admin         | Planned    |
| DELETE | `/exams/:id`           | Xóa đề thi                         | Admin         | Planned    |
| PATCH  | `/exams/:id/publish`   | Công khai đề thi                   | Admin         | Planned    |
| PATCH  | `/exams/:id/unpublish` | Chuyển đề thi về trạng thái Draft | Admin         | Planned    |

Hỗ trợ lọc đề thi theo trạng thái:

`GET /exams?status=PUBLISHED`

`GET /exams?status=DRAFT`

## 6. Questions Module

Questions module quản lý câu hỏi trong đề thi.

| Method | Endpoint                   | Mô tả                        | Quyền         | Trạng thái |
| ------ | -------------------------- | ---------------------------- | ------------- | ---------- |
| GET    | `/exams/:examId/questions` | Lấy danh sách câu hỏi của đề | Student/Admin | Planned    |
| POST   | `/exams/:examId/questions` | Thêm câu hỏi vào đề thi      | Admin         | Planned    |
| GET    | `/questions/:id`           | Xem chi tiết câu hỏi         | Student/Admin | Planned    |
| PATCH  | `/questions/:id`           | Cập nhật câu hỏi             | Admin         | Planned    |
| PATCH  | `/questions/:id/order`     | Thay đổi thứ tự câu hỏi      | Admin         | Planned    |
| DELETE | `/questions/:id`           | Xóa câu hỏi                  | Admin         | Planned    |

Câu hỏi hỗ trợ:

* Trắc nghiệm A/B/C/D
* Tự luận
* Hình ảnh
* Đáp án đúng
* Giải thích
* Hướng dẫn
* Thời gian riêng cho từng câu

Ghi chú: Khi học sinh xem câu hỏi, hệ thống không được trả về đáp án đúng trước thời điểm cho phép.

## 7. Assignments Module

Assignments module cho phép Admin giao đề thi cho học sinh.

| Method | Endpoint           | Mô tả                            | Quyền         | Trạng thái |
| ------ | ------------------ | -------------------------------- | ------------- | ---------- |
| POST   | `/assignments`     | Giao đề thi cho học sinh         | Admin         | Planned    |
| GET    | `/assignments`     | Xem danh sách đề được giao       | Student/Admin | Planned    |
| GET    | `/assignments/:id` | Xem chi tiết assignment          | Student/Admin | Planned    |
| PATCH  | `/assignments/:id` | Cập nhật deadline hoặc thông tin | Admin         | Planned    |
| DELETE | `/assignments/:id` | Hủy assignment                   | Admin         | Planned    |

Hỗ trợ lọc assignment theo học sinh:

`GET /assignments?userId=123`

Hỗ trợ lọc assignment theo trạng thái:

`GET /assignments?status=OVERDUE`

Các trạng thái có thể sử dụng:

* PENDING
* IN_PROGRESS
* COMPLETED
* OVERDUE

## 8. Attempts / Submissions Module

Attempts module xử lý quá trình làm bài, lưu câu trả lời, nộp bài và xem kết quả.

| Method | Endpoint                  | Mô tả                        | Quyền         | Trạng thái |
| ------ | ------------------------- | ---------------------------- | ------------- | ---------- |
| POST   | `/exams/:examId/attempts` | Bắt đầu làm bài              | Student       | Planned    |
| GET    | `/attempts`               | Xem lịch sử làm bài          | Student/Admin | Planned    |
| GET    | `/attempts/:id`           | Xem chi tiết một lần làm bài | Student/Admin | Planned    |
| POST   | `/attempts/:id/answers`   | Gửi hoặc lưu câu trả lời     | Student       | Planned    |
| POST   | `/attempts/:id/submit`    | Nộp bài                      | Student       | Planned    |
| GET    | `/attempts/:id/result`    | Xem kết quả bài làm          | Student/Admin | Planned    |

Ghi chú: Mỗi câu hỏi có thời gian riêng.

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