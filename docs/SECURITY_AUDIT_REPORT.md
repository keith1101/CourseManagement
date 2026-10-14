# Báo cáo Kiểm toán An ninh & Kế hoạch Khắc phục (Security Audit Report)
> **Dự án:** CourseManagement (Backend & Frontend)  
> **Nguồn gốc dữ liệu:** Phiên kiểm toán an ninh chuyên sâu `#29` (`01a0e3ad-f5af-7301-9481-d2fec79ddd45`).  
> **Các Pull Request khắc phục:**  
> - Backend: [PR #3 — Backend Security Fixes](https://github.com/keith1101/CourseManagement/pull/3)  
> - Frontend: [PR #2 — Frontend Registration and Verification Updates](https://github.com/keith1101/CourseManagement_FE/pull/2)

---

## 1. Tóm tắt Đánh giá Chung

Vào ngày 27/09/2026, kho lưu trữ mã nguồn `CourseManagement` và `CourseManagement_fe` đã được rà soát an ninh toàn diện bởi công cụ Codex Security. Quá trình kiểm toán tập trung vào:
- Rò rỉ thông tin nhạy cảm và dữ liệu cá nhân (PII, credentials, database backups).
- Xác thực và phân quyền (Authentication, Session Management, JWT lifecycle).
- Tính toàn vẹn dữ liệu thi cử và gian lận điểm số (Exam flow integrity & client tampering).
- Cấu hình an toàn hạ tầng và container (TLS/SSL validation, Docker configuration).

---

## 2. Chi tiết Các Phát hiện An ninh (Vulnerability Findings)

### 2.1. Nhóm Lỗ hổng Mức độ Nghiêm trọng & Cao (High / Critical)

#### FINDING-01: Rò rỉ Bản sao lưu Cơ sở Dữ liệu Thực trong Source Code (`prismaorm.dump`)
- **Tình trạng:** File `prismaorm.dump` được theo dõi trực tiếp trong Git repository của backend.
- **Phân tích:** Đây là file archive nhị phân sao lưu toàn bộ cơ sở dữ liệu PostgreSQL. Nội dung trích xuất được bao gồm:
  - 11 tài khoản người dùng kèm thông tin cá nhân và hash mật khẩu.
  - 5 token xác minh email còn hiệu lực.
  - 6 đề thi, 34 câu hỏi kèm đáp án đúng.
  - 39 lượt làm bài và 68 câu trả lời của học viên.
- **Mối nguy:** Bất kỳ ai có quyền truy cập vào repo hoặc nếu repo bị public thì toàn bộ dữ liệu người dùng và ngân hàng đề thi sẽ bị lộ lọt hoàn toàn.
- **Hành động khắc phục:**
  1. Xóa bỏ file `prismaorm.dump` khỏi nhánh làm việc chính trong PR #3.
  2. Bổ sung `*.dump`, `*.sql`, `*.bak` vào file `.gitignore`.
  3. **Lưu ý quan trọng:** File vẫn còn tồn tại trong lịch sử Git cũ (`git log`). Cần tiến hành chạy công cụ `git filter-repo` hoặc BFG Repo-Cleaner để loại bỏ vĩnh viễn khỏi commit history của GitHub.

#### FINDING-02: Không Xác minh Chứng chỉ Máy chủ PostgreSQL ở Production (TLS/SSL Bypass)
- **Tình trạng:** Kết nối cơ sở dữ liệu production chấp nhận chứng chỉ không đáng tin cậy hoặc tự ký mà không kiểm tra CA.
- **Mối nguy:** Tấn công Man-In-The-Middle (MITM) trên đường truyền giữa API Server (Render) và Database (Cloud SQL/Supabase).
- **Hành động khắc phục:**
  - Bật xác thực chứng chỉ máy chủ nghiêm ngặt trong Prisma adapter (`sslmode=require`).
  - Hỗ trợ biến môi trường `DATABASE_SSL_CA` để lập trình viên có thể truyền chứng chỉ gốc của nhà cung cấp Cloud (ví dụ: Google Cloud SQL Server CA).

---

### 2.2. Nhóm Lỗ hổng Mức độ Trung bình (Medium)

#### FINDING-03: Kích hoạt Mật khẩu Trước khi Chủ sở hữu Email Xác minh Danh tính
- **Hiện tượng:** Luồng đăng ký cũ nhận `password` ngay tại form đăng ký ban đầu. Kẻ tấn công có thể dùng email của nạn nhân để đăng ký và đặt mật khẩu mà nạn nhân không hay biết. Khi nạn nhân vô tình bấm vào liên kết kích hoạt, tài khoản bị kích hoạt với mật khẩu của kẻ tấn công.
- **Hành động khắc phục:**
  - Tách quy trình đăng ký thành 2 pha:
    - **Pha 1:** Đăng ký chỉ cung cấp họ tên, email, ngày sinh $\rightarrow$ Lưu `password = null`.
    - **Pha 2:** Mở email $\rightarrow$ Bấm liên kết kèm token xác minh $\rightarrow$ Form thiết lập mật khẩu mới lần đầu.
  - Tạo Prisma migration để xóa mật khẩu của các tài khoản chưa xác minh trước đây.

#### FINDING-04: Gian lận Chấm điểm Bài thi thông qua Dữ liệu Trình duyệt Gửi lên
- **Hiện tượng:** Luồng thi V1 tin cậy các trường `normalizedText` và `numericValue` do Client tính toán và gửi lên trong request nộp bài.
- **Mối nguy:** Học viên sử dụng DevTools hoặc Postman để sửa `normalizedText` khớp với đáp án đúng để đạt điểm tối đa.
- **Hành động khắc phục:** Chuyển dịch toàn bộ sang Luồng thi V2. Backend độc lập kiểm tra đáp án và tính điểm trực tiếp từ database, bỏ qua hoàn toàn các trường dữ liệu tự tính của client.

#### FINDING-05: Không Thu hồi Token JWT khi Thay đổi Quyền hoặc Khóa Tài khoản
- **Hiện tượng:** Khi Admin khóa tài khoản học viên hoặc thay đổi Role của tài khoản, token JWT đã cấp trước đó vẫn có hiệu lực cho đến khi hết hạn (thời gian sống token).
- **Hành động khắc phục:** Bổ sung hook kiểm tra trạng thái hoạt động (`isActive`) và phiên bản quyền hạn hiện tại trong `JwtStrategy`. Ngay khi tài khoản bị khóa, mọi request tiếp theo đều bị chặn trả lời mã `401 Unauthorized`.

---

### 2.3. Nhóm Lỗ hổng Mức độ Thấp & Vấn đề Cấu hình (Low / Info)

#### FINDING-06: Lộ Trạng thái Tài khoản qua Phản hồi Đăng nhập / Đăng ký (Account Enumeration)
- **Hiện tượng:** Thông báo lỗi chi tiết như `"Email đã tồn tại"` hoặc `"Tài khoản chưa được kích hoạt"` giúp kẻ tấn công dò tìm được danh sách email có trong hệ thống.
- **Hành động khắc phục:** Chuẩn hóa các thông báo lỗi chung, không tiết lộ sự tồn tại của email đối với người dùng chưa xác thực.

#### FINDING-07: Docker Compose Lộ Cổng Cơ sở Dữ liệu & Mật khẩu Mặc định
- **Hiện tượng:** File `docker-compose.yml` mở cổng `5432` và `8080` ra toàn bộ mạng (`0.0.0.0`) và sử dụng mật khẩu tĩnh `postgrespassword`.
- **Hành động khắc phục:**
  - Ràng buộc cổng chỉ lắng nghe tại máy local: `127.0.0.1:5432:5432` và `127.0.0.1:8080:8080`.
  - Thay thế mật khẩu hardcode bằng biến môi trường `POSTGRES_PASSWORD` đọc từ file `.env`.

---

## 3. Tổng kết Các Thay đổi Code & Triển khai

### 3.1. Các thay đổi tại Backend (`CourseManagement` - PR #3)
- `prisma/schema.prisma`: Cho phép `password` có giá trị `null` đối với tài khoản chờ xác minh email.
- `prisma/migrations/`: Bổ sung migration tạo token xác minh và xóa mật khẩu tài khoản rác.
- `src/auth/auth.service.ts`: Triển khai luồng đăng ký 2 bước và cơ chế băm mật khẩu khi kích hoạt.
- `src/auth/jwt.strategy.ts`: Rà soát trạng thái hoạt động của tài khoản trong thời gian thực.
- `src/exams/exams.service.ts`: Chuyển đổi toàn bộ các lượt thi mới sang máy trạng thái V2.
- `docker-compose.yml` & `.env.example`: Cập nhật cấu hình bảo mật container và biến môi trường TLS.

### 3.2. Các thay đổi tại Frontend (`CourseManagement_fe` - PR #2)
- Cập nhật trang Đăng ký: Bỏ trường mật khẩu tại bước điền form ban đầu.
- Xây dựng trang Kích hoạt & Đặt mật khẩu (`SetPasswordPage.tsx` / `VerifyEmailPage.tsx`).
- Đồng bộ máy trạng thái màn hình thi cử với hệ thống tính giờ và chấm điểm V2 của Backend.

### 3.3. Trình tự Triển khai An toàn (Deployment Order)
1. **Bước 1:** Merge và Deploy **Backend** trước. Chạy lệnh migrate: `pnpm exec prisma migrate deploy`.
2. **Bước 2:** Merge và Deploy **Frontend** sau.
3. **Bước 3:** Chạy lệnh rà soát lịch sử Git để xóa vĩnh viễn file `prismaorm.dump` trên GitHub repository.
