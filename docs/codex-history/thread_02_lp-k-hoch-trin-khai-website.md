# Conversation #2: Lập kế hoạch triển khai website

- **Thread ID:** `019f65e4-444c-7253-821f-748c68277137`
- **Created At:** 2026-07-15T13:08:06.000Z
- **Updated At:** 2026-07-15T13:23:13.000Z
- **Working Directory:** `\\?\D:\Project\CourseManagement`
- **Model:** `gpt-5.6-sol`
- **Messages:** 1 User, 8 Assistant (Total: 10)

---

### 👤 User _(2026-07-15T13:08:24.496Z)_

# Files mentioned by the user:

## Mô_Tả_Website_v0.2.pdf: D:\Project\CourseManagement\Mô_Tả_Website_v0.2.pdf

## My request for Codex:
Lập plan triển khai website này

---

### 🤖 Codex Assistant _(2026-07-15T13:08:29.714Z)_

Mình sẽ dùng kỹ năng PDF để đọc đúng nội dung và bố cục tài liệu, đồng thời kiểm tra mã nguồn hiện có trước khi chốt phạm vi và kiến trúc triển khai. Trước mắt mình chỉ khảo sát, chưa thay đổi file nào.

---

### 🤖 Codex Assistant _(2026-07-15T13:08:46.474Z)_

Mình đang tách khảo sát thành hai hướng song song: một nhánh rà tài liệu yêu cầu, một nhánh rà cấu trúc dự án. Sau đó mình sẽ đối chiếu hai phía để plan bám đúng cả sản phẩm lẫn code hiện có.

---

### 🤖 Codex Assistant _(2026-07-15T13:10:19.074Z)_

Đã xác nhận đây là dự án greenfield: thư mục hiện chỉ có tài liệu, chưa có source code, database, test hay CI/CD. Mình cũng thấy `plan.md` là một bản nháp kiến trúc, nhưng có vài quyết định khác với PDF v0.2 nên chưa thể mặc nhiên coi là yêu cầu đã chốt.

---

### 🤖 Codex Assistant _(2026-07-15T13:11:58.895Z)_

Đã chốt ba quyết định nền: lấy PDF v0.2 làm nguồn chuẩn, mỗi đề đúng một môn/một loại, và dùng stack managed TypeScript. Mình đang khóa tiếp các quy tắc ảnh hưởng trực tiếp đến schema, phân quyền và lịch triển khai.

---

### 🤖 Codex Assistant _(2026-07-15T13:14:46.380Z)_

Lượt chọn vừa rồi không ghi nhận câu trả lời, nên nếu bạn không muốn quyết định thêm mình sẽ dùng các mặc định đã đề xuất: đội 2 dev + QA bán thời gian, Admin chọn đúng 2 đề miễn phí, và số lượt làm cấu hình theo đề (mặc định 1). Ba quy tắc dưới đây là các điểm còn ảnh hưởng lớn nhất đến trải nghiệm thi và bảo vệ nội dung.

---

### 🤖 Codex Assistant _(2026-07-15T13:15:55.358Z)_

Các quy tắc nghiệp vụ chính đã đủ rõ. Mình đang kiểm tra lại khả năng triển khai của stack managed theo tài liệu chính thức hiện hành, đặc biệt phần phân quyền dữ liệu, private storage và xử lý DOCX nền.

---

### 🤖 Codex Assistant _(2026-07-15T13:18:34.204Z)_

Stack đã được xác nhận khả thi. Một ràng buộc quan trọng là Vercel Function giới hạn payload 4,5 MB, nên file sẽ upload thẳng vào private Storage; scan virus và đổi DOCX sang PDF chạy bất đồng bộ bằng worker Cloud Run, không chạy trong request web. Còn ba tham số để khóa timeline và tiêu chí tải.

---

### 🤖 Codex Assistant _(2026-07-15T13:21:01.887Z)_

Mình đã hoàn tất đối chiếu tài liệu và đang dọn các ảnh render tạm dùng để kiểm tra PDF; không đụng tới các tài liệu gốc trong dự án. Sau đó mình sẽ đưa bản plan hoàn chỉnh, đã khóa kiến trúc, API, roadmap và tiêu chí nghiệm thu.

---

### 📋 Plan _(2026-07-15T13:23:12.637Z)_

{
  "type": "plan",
  "id": "019f65e4-8af2-7cd3-a30a-5781f28a6883-plan",
  "text": "# Kế hoạch triển khai MVP Website quản lý khóa học và luyện thi\n\n## 1. Tóm tắt\n\n- Nguồn yêu cầu chính là [PDF v0.2](<D:/Project/CourseManagement/Mô_Tả_Website_v0.2.pdf>); dự án hiện là greenfield, chưa có source code.\n- Xây dựng web responsive tiếng Việt gồm cổng Admin và Học sinh, triển khai theo mô hình managed TypeScript.\n- Stack: Next.js App Router/Route Handlers trên Vercel, Supabase Auth + PostgreSQL + RLS + private Storage, Cloud Run Job cho xử lý tài liệu.\n- Hạ tầng production trả phí, đặt tại Singapore: Vercel `sin1`, Supabase `ap-southeast-1`.\n- Nhân sự: 2 full-stack developer và QA/DevOps bán thời gian.\n- Tiến độ: 10 tuần triển khai/UAT, cộng 2 tuần dự phòng; tải mục tiêu tối đa 50 học sinh thi đồng thời.\n\n## 2. Kiến trúc, dữ liệu và giao diện hệ thống\n\n### Nền tảng\n\n- Next.js modular monolith cung cấp UI, server-rendering và API nội bộ qua Route Handlers. Cấu trúc này được hỗ trợ trực tiếp bởi [Next.js App Router](https://nextjs.org/docs/app/getting-started/route-handlers).\n- Supabase quản lý email/password, PostgreSQL, migration và private Storage. Mọi bảng public và `storage.objects` phải có RLS; secret key chỉ tồn tại phía server. [Supabase Storage hỗ trợ RLS cho private bucket](https://supabase.com/docs/guides/storage/security/access-control).\n- File không đi qua Vercel Function vì payload bị giới hạn 4,5 MB theo [Vercel Function limits](https://vercel.com/docs/functions/limitations). Browser nhận quyền upload ngắn hạn và tải trực tiếp vào bucket quarantine.\n- Tác vụ tài liệu được ghi vào [Supabase Queues](https://supabase.com/docs/guides/queues). Cloud Scheduler gọi [Cloud Run Job](https://cloud.google.com/run/docs/create-jobs) mỗi phút để quét virus, đổi DOCX sang PDF và cập nhật trạng thái; worker phải idempotent và retry an toàn.\n- Tách local, staging và production; CI chạy typecheck, lint, migration checks, unit/integration/E2E trước khi deploy.\n\n### Mô hình dữ liệu\n\n- `profiles`: Supabase user, role, trạng thái khóa, tier, thời hạn Pro, cờ bắt buộc đổi mật khẩu.\n- `subjects`: seed 6 môn trong PDF; Admin được thêm, đổi tên, sắp xếp và archive. Môn đã được sử dụng không được xóa cứng.\n- `exams → exam_versions → questions`: bản publish bất biến; sửa đề đã publish sẽ clone thành draft phiên bản mới.\n- `mcq_options` và `fill_answer_keys`: đáp án trắc nghiệm hoặc đáp án điền dạng text/number; answer key nằm trong schema server-only.\n- `assignments`: học sinh, phiên bản đề, thời gian giao và deadline.\n- `attempts → attempt_answers`: phiên bản đề, lượt làm, câu hiện tại, deadline câu, đáp án, kết quả và thời điểm nộp.\n- `resources`, `resource_files`, `processing_jobs`: tài liệu PDF/DOCX, video embed, tier truy cập và trạng thái xử lý.\n- `audit_logs`: khóa tài khoản, thay đổi Pro, reset mật khẩu, publish, assign và thao tác tài liệu.\n\n### Types và API nội bộ\n\nCác enum chính:\n\n- `Role = ADMIN | STUDENT`\n- `AccessTier = FREE | PRO`\n- `ExamType = MCQ | FILL_IN`\n- `AnswerKind = TEXT | NUMBER`\n- `VersionStatus = DRAFT | PUBLISHED | ARCHIVED`\n- `AttemptStatus = IN_PROGRESS | SUBMITTED | AUTO_SUBMITTED`\n- `QuestionOutcome = CORRECT | WRONG | TIMED_OUT`\n- `ResourceStatus = QUARANTINED | PROCESSING | READY | INFECTED | FAILED | ARCHIVED`\n\nKhông mở API công khai trong MVP. Các Route Handler quan trọng gồm:\n\n- Auth/account: đăng ký, đổi mật khẩu, Admin tạo/reset/khóa user và cập nhật Pro.\n- Admin: CRUD môn, draft đề/câu hỏi, publish phiên bản, assign, quản lý tài liệu/video.\n- Thi: `start`, `current`, `submit-answer`, `continue`, `history`.\n- `start/current` chỉ trả câu hiện tại, `serverNow` và `deadlineAt`; không trả answer key.\n- `submit-answer` nhận đáp án và idempotency key, chấm trong transaction rồi trả outcome, đáp án đúng, giải thích và hành động tiếp theo.\n- `view-session` kiểm tra entitlement trước khi cấp URL tài liệu ngắn hạn và thông tin watermark.\n\n## 3. Quy tắc triển khai chức năng\n\n### Xác thực và phân quyền\n\n- Đăng ký bằng email chuẩn hóa lowercase và mật khẩu; không có OTP hoặc xác thực email trong MVP. Tài khoản mới mặc định là FREE.\n- Quên mật khẩu hiển thị Zalo hỗ trợ. Admin cấp mật khẩu tạm, thu hồi phiên cũ và bắt buộc đổi mật khẩu ở lần đăng nhập tiếp theo.\n- Pro là một tier toàn hệ thống, có thời gian bắt đầu/hết hạn. Lượt thi đã bắt đầu được hoàn tất dù Pro vừa hết hạn, trừ khi tài khoản bị khóa hoặc assignment hết hạn.\n- Admin chọn tối đa đúng hai đề đang publish làm FREE. Tài liệu được gắn FREE/PRO độc lập.\n- Assignment cấp quyền trực tiếp tới phiên bản đề, vượt paywall Pro nhưng không vượt trạng thái khóa tài khoản.\n\n### Soạn và phát hành đề\n\n- Mỗi đề thuộc đúng một môn và một loại.\n- Trắc nghiệm: draft mới mặc định 20 câu, cho phép đổi số lượng; mỗi câu có đúng 4 đáp án và một đáp án đúng.\n- Điền đáp án: từ 4–10 câu; mỗi câu chọn đáp án chuẩn dạng text hoặc number.\n- Câu hỏi và đáp án hỗ trợ text và ảnh; mỗi câu có hướng dẫn, giải thích và thời lượng riêng. UI cung cấp preset 180/300/500/600 giây và cho phép cấu hình số giây hợp lệ.\n- Không có tổng thời gian toàn đề. Mỗi câu tính một điểm, kết quả là `số câu đúng/tổng số câu`.\n- Số lượt làm cấu hình theo đề, mặc định một; lịch sử lưu toàn bộ lượt, mới nhất trước.\n- Bản publish bất biến. Assignment và attempt luôn tham chiếu đúng phiên bản đã giao/đã làm.\n\n### Engine làm bài\n\n- Server tạo `presented_at` và `deadline_at`; client chỉ hiển thị countdown. Refresh hoặc mất mạng không reset thời gian.\n- Mỗi câu chỉ trả lời một lần, không quay lại:\n  - Đúng: phát âm thanh “ting ting” và tự chuyển câu.\n  - Sai/hết giờ: khóa câu, tô đáp án đúng, hiện giải thích và chờ nút “Tiếp tục”.\n- Mở hướng dẫn không dừng timer; có nút tắt âm thanh.\n- Text được NFKC, trim, gom khoảng trắng và so sánh không phân biệt hoa/thường; vẫn phân biệt dấu tiếng Việt và dấu câu.\n- Number được parse sang Decimal và so sánh chính xác; không dùng floating point. Nhiều đáp án, dung sai và đơn vị nằm ngoài MVP.\n- Submit dùng transaction, row lock và idempotency key để chống double-click, retry và nhiều tab.\n- Deadline thực tế là thời điểm sớm hơn giữa deadline câu và deadline assignment. Assignment quá hạn trước khi bắt đầu hiển thị “Quá hạn nộp bài”; nếu hết hạn giữa lượt thi, hệ thống tự nộp phần đã hoàn thành.\n- API luôn kiểm tra deadline tức thời; Supabase Cron chỉ dùng để đối soát attempt bị treo.\n\n### Tài liệu và video\n\n- Mặc định PDF/DOCX tối đa 25 MB; ảnh câu hỏi JPG/PNG/WebP tối đa 5 MB, có thể đổi bằng cấu hình.\n- Kiểm tra extension, MIME/magic bytes, malware và giới hạn thời gian xử lý. DOCX chỉ được đưa lên catalog sau khi LibreOffice chuyển thành PDF thành công.\n- Viewer dùng PDF.js, URL ký ngắn hạn được làm mới sau mỗi lần kiểm tra quyền, ẩn nút tải/in và phủ watermark email/user ID. Đây là bảo vệ best-effort, không cam kết chặn screenshot hoặc trích xuất tuyệt đối.\n- Video chỉ lưu provider/embed ID; MVP allowlist YouTube và Vimeo, không nhận URL iframe tùy ý và không upload video trực tiếp.\n- Database và Storage phải backup riêng vì [Supabase database backup không bao gồm file Storage](https://supabase.com/docs/guides/platform/backups).\n\n## 4. Roadmap và kiểm thử\n\n| Thời gian | Hạng mục | Điều kiện hoàn thành |\n|---|---|---|\n| Tuần 1 | Khởi tạo monorepo, CI/CD, environments, wireframe, schema/RLS, spike timer và worker DOCX | Staging hoạt động; ERD, API contract và threat model được review |\n| Tuần 2–3 | Auth, user, khóa/mở khóa, Pro, reset qua Zalo, CRUD môn | Hoàn tất test vòng đời tài khoản và phân quyền |\n| Tuần 4–5 | Editor hai loại đề, ảnh, versioning, publish, hai đề FREE và assignment | Admin tạo, publish và assign được đề mẫu hoàn chỉnh |\n| Tuần 6–7 | Attempt engine, timer, chấm điểm, feedback, số lượt và lịch sử | Luồng thi hoàn chỉnh trên desktop/mobile; vượt race-condition tests |\n| Tuần 8 | Upload PDF/DOCX, queue/worker, private viewer, watermark và video embed | Chỉ tài liệu sạch/chuyển đổi thành công mới xuất hiện |\n| Tuần 9 | Security, accessibility, load test, monitoring, audit log và restore drill | Không còn lỗi P0/P1; đạt chỉ tiêu tải |\n| Tuần 10 | UAT, nhập dữ liệu mẫu, pilot 5–10 học sinh, sửa lỗi và go-live | Khách hàng ký nghiệm thu MVP |\n| Tuần 11–12 | Dự phòng | Chỉ dùng cho lỗi UAT, trình duyệt hoặc xử lý DOCX |\n\nKiểm thử bắt buộc:\n\n- Unit: chuẩn hóa text/number, FREE/PRO/assignment, số lượt, deadline và state machine.\n- Integration: RLS, publish transaction, versioning, idempotent submit, nhiều tab, Pro hết hạn, queue/retry và auto-submit.\n- E2E: đăng ký/login; Admin tạo hai loại đề; sửa đề tạo version mới; user FREE/PRO/assigned; refresh không reset timer; phản hồi đúng/sai/hết giờ; lịch sử và quá hạn.\n- Document E2E: PDF, DOCX, file giả MIME, file nhiễm, conversion fail, URL hết hạn, watermark và truy cập trái phép.\n- Security: IDOR, answer-key leakage, RLS bypass, XSS, brute force, secret exposure và video ngoài allowlist.\n- Load test 50 học sinh đồng thời: p95 submit dưới 800 ms, lỗi dưới 1%, không mất hoặc ghi trùng đáp án, countdown lệch server không quá một giây.\n- Go-live chỉ khi toàn bộ tiêu chí PDF v0.2 qua UAT, restore drill thành công và không còn lỗi P0/P1.\n\n## 5. Giả định và ngoài phạm vi\n\n- Giao diện tiếng Việt, responsive; lưu timestamp UTC và hiển thị theo `Asia/Bangkok`.\n- Khách hàng cung cấp domain, branding, nội dung đề/tài liệu, âm thanh và số Zalo. Nếu chưa có branding, dùng giao diện trung tính, ưu tiên khả năng đọc và thao tác mobile.\n- Production dùng gói managed trả phí; database, Vercel Functions và worker đặt tại Singapore.\n- Hai mặc định chưa được chỉ định trong PDF: Admin chọn đúng hai đề FREE; số lượt làm cấu hình theo đề và mặc định một.\n- Ngoài MVP: thanh toán/nâng cấp tự động, OTP/email verification, social login, ngân hàng câu hỏi, assign theo nhóm, OCR/AI, dashboard phân tích, chấm tự luận thủ công, điểm có trọng số, upload video trực tiếp, native app và DRM tuyệt đối.\n"
}

---

