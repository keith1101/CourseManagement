# Báo cáo Kế hoạch Thiết kế Hạ tầng & Chi phí Vận hành Hàng tháng
> **Dự án:** CourseManagement  
> **Nguồn gốc dữ liệu:** Phê duyệt từ cuộc hội thoại `#26` (`01a08e55-f8f9-7561-992c-cfa8a11e395c`).  
> **File bảng tính gốc:** [`outputs/01a08e55-f8f9-7561-992c-cfa8a11e395c/infrastructure_design_cost_plan.xlsx`](file:///d:/Project/CourseManagement/outputs/01a08e55-f8f9-7561-992c-cfa8a11e395c/infrastructure_design_cost_plan.xlsx)

---

## 1. Mục tiêu & Tiêu chí Lựa chọn Hạ tầng

Hệ thống CourseManagement bao gồm:
1. **API Service (Backend):** NestJS ứng dụng kiến trúc RESTful, kết nối cơ sở dữ liệu và xử lý các tác vụ chấm điểm, quản lý phiên thi trực tuyến.
2. **Web Client (Frontend):** React Single Page Application (SPA).
3. **Database:** PostgreSQL phục vụ lưu trữ tài khoản, đề thi, câu hỏi và lịch sử làm bài.
4. **Media Storage:** Google Cloud Storage lưu trữ tài liệu khóa học và hình ảnh minh họa đề thi.
5. **Dịch vụ Email:** Gửi mã xác minh tài khoản và thông báo hệ thống.

### Tiêu chí Đánh giá:
- **Độ trễ thấp (Low Latency):** Nhắm tới người dùng tại Việt Nam và Đông Nam Á.
- **Tiết kiệm chi phí ban đầu (Cost-Efficiency):** Tận dụng tối đa Free Tier trong giai đoạn phát triển và MVP, có khả năng nâng cấp mượt mà khi người dùng tăng.
- **Độ tin cậy & Tính sẵn sàng (High Availability):** Cơ chế sao lưu tự động và khả năng phục hồi nhanh.

---

## 2. So sánh Các Phương án Hạ tầng

### 2.1. Cơ sở Dữ liệu (Database: Cloud SQL vs Supabase vs Neon)

| Tiêu chí | Google Cloud SQL (Postgres) | Supabase (Managed Postgres) | Neon Postgres (Serverless) |
|---|---|---|---|
| **Mô hình tính phí** | Cố định theo giờ instance + dung lượng đĩa + IP tĩnh. | Gói Pro cố định $25/tháng, bao gồm 8GB DB, 100k auth users, backup tự động. | Pay-as-you-go theo compute hour và storage; tự động scale-to-zero khi không dùng. |
| **Chi phí tối thiểu** | ~$35 - $45 / tháng (vCPU 1, RAM 3.75GB). | Miễn phí cho 2 project nhỏ; $25/tháng cho Pro. | Miễn phí cho 0.5GB; ~$19/tháng cho gói Launch. |
| **Location / Region** | Có region Singapore, Jakarta, Đài Loan. | Region Singapore (`ap-southeast-1`). | Region Singapore (`ap-southeast-1`). |
| **Đánh giá** | Tốn kém cho giai đoạn MVP, phù hợp nếu toàn bộ hệ thống nằm trên GCP. | **Lựa chọn tối ưu nhất:** Tích hợp sẵn dashboard trực quan, backup 7 ngày, pooling PG Bouncer. | Phù hợp cho môi trường Dev/Staging để tận dụng tính năng scale to zero. |

### 2.2. Máy chủ Ứng dụng (Compute: Render vs Amazon EC2 vs Cloud Run)

| Tiêu chí | Render.com Web Service | Amazon EC2 (`t4g.small`) | Google Cloud Run |
|---|---|---|---|
| **Vị trí Server** | Singapore / Frankfurt / Oregon. | Bangkok (Thailand - `ap-southeast-7`) hoặc Singapore. | Singapore (`asia-southeast1`). |
| **Chi phí** | $7/tháng (Starter 512MB RAM) đến $25/tháng (Standard 2GB RAM). | ~$12 - $15 / tháng (2 vCPU ARM Graviton2, 2GB RAM, 30GB EBS gp3). | Miễn phí 2 triệu requests/tháng; tính theo thời gian CPU/RAM thực tế. |
| **Mức độ quản trị** | Không cần quản trị OS, tự động build từ Git. | Tự cài đặt Docker, Nginx, SSL Certbot. | Container serverless, không cần quản trị OS. |
| **Đánh giá** | Dễ triển khai ban đầu cho staging. | **Tốt nhất cho Production hiệu năng cao:** Vị trí Bangkok cho ping về Việt Nam cực thấp (~15 - 25ms), tài nguyên độc lập 2GB RAM. | Phù hợp khi lưu lượng truy cập thất thường, có nguy cơ cold-start khi làm bài thi. |

### 2.3. Dịch vụ Email (Gmail vs Resend)

| Tiêu chí | Gmail Cá nhân / Workspace SMTP | Resend API (Transactional Email) |
|---|---|---|
| **Mục đích phù hợp** | Giao tiếp giữa người với người (Hộp thư cá nhân / Doanh nghiệp). | Gửi email tự động của ứng dụng (Xác minh tài khoản, reset mật khẩu, thông báo). |
| **Giới hạn gửi** | Gmail cá nhân: 500 mail/ngày; Workspace: 2.000 mail/ngày. Dễ bị chặn nếu gửi hàng loạt. | Gói Free: 3.000 email/tháng, 100 email/ngày. Gói Pro ($20/tháng): 50.000 email/tháng. |
| **Tỷ lệ vào Inbox** | Trung bình nếu gửi qua script tự động (dễ bị vào Spam hoặc đánh dấu Suspicious). | Rất cao nhờ ký số DKIM, SPF, DMARC gắn với tên miền riêng. |
| **Đề xuất** | Sử dụng Gmail cho môi trường Dev/Staging nội bộ. | **Bắt buộc sử dụng Resend (hoặc SendGrid) cho môi trường Production.** |

---

## 3. Bảng Dự toán Chi phí Vận hành Theo Từng Giai đoạn

### Kịch bản 1: Giai đoạn Phát triển & MVP (Chi phí tối thiểu)
- **Frontend:** Vercel Hobby (Miễn phí)
- **Backend:** Render Free hoặc Starter ($0 - $7/tháng)
- **Database:** Supabase Free Tier hoặc Neon Free Tier ($0/tháng)
- **Email:** Gmail SMTP cá nhân ($0/tháng)
- **Tên miền:** Tên miền phụ miễn phí (`*.vercel.app`, `*.onrender.com`)
- **Tổng chi phí:** **$0.00 - $7.00 / tháng**

### Kịch bản 2: Production Tiêu chuẩn (Khuyên dùng cho 500 - 2.000 học viên)
> Bảng tham chiếu công thức từ `infrastructure_design_cost_plan.xlsx`:

| Hạng mục | Quy cách kỹ thuật | Nhà cung cấp | Chi phí ước tính (USD / tháng) |
|---|---|---|---|
| **API Server** | 1x EC2 `t4g.small` (2 vCPU, 2GB RAM) tại Bangkok + 30GB EBS gp3 + 1 IPv4 tĩnh | Amazon Web Services (AWS) | $15.00 |
| **Cơ sở dữ liệu** | Supabase Pro Plan (8GB Storage, 100k MAU, Auto Daily Backups, PITR) | Supabase | $25.00 |
| **Lưu trữ Media** | Google Cloud Storage (khoảng 50GB file + 20GB egress) | Google Cloud (GCP) | $4.86 |
| **Tên miền** | 1 Tên miền `.com` (đăng ký qua Cloudflare Registrar ~$10 - $12/năm) | Cloudflare / Verisign | $1.00 |
| **Email Giao dịch** | Resend Free Plan (< 3.000 mail/tháng, 100 mail/ngày) | Resend | $0.00 |
| **Frontend CDN** | Vercel Pro hoặc Cloudflare Pages | Cloudflare / Vercel | $0.00 |
| **TỔNG CỘNG** | | | **~$45.86 / tháng** |

### Kịch bản 3: Production Chuyên nghiệp (Tích hợp Google Workspace)
- Kịch bản 2 + 1 Hộp thư Google Workspace Business Starter (`admin@yourdomain.com`):
- **Tổng chi phí:** **~$52.86 / tháng**

### Kịch bản 4: Production Mở rộng (Trên 5.000 học viên)
- Kịch bản 3 + Nâng cấp gói Resend Pro (50.000 emails/tháng):
- **Tổng chi phí:** **~$65.86 / tháng**

---

## 4. Khuyến nghị Kiến trúc Triển khai (Actionable Recommendations)

1. **Phân tách Hộp thư:** Không sử dụng hộp thư Gmail cá nhân làm relay SMTP trên production vì nguy cơ bị Google gắn cờ spam và khóa tài khoản là rất lớn.
2. **Khu vực đặt máy chủ:** Nên ưu tiên chọn khu vực **Bangkok (`ap-southeast-7`)** hoặc **Singapore (`ap-southeast-1`)** cho EC2 và Database để đảm bảo thời gian tải trang và nộp câu hỏi thi trắc nghiệm đạt độ trễ dưới 50ms.
3. **Cơ chế sao lưu (Backup Strategy):** Thiết lập cronjob hàng ngày sao lưu dump database lên Google Cloud Storage hoặc S3, kích hoạt tính năng Point-in-time Recovery (PITR) của Supabase để phòng ngừa sự cố mất mát dữ liệu.
