# Test report — Release acceptance

**Ngày chạy:** 2026-09-02
**Commit local:** `7fdecde0e7c7c4ecdd0fd4405dd3029014992c6c`
**Production API:** `https://course-management-api-y1x7.onrender.com/api`
**Production frontend:** `https://course-management-fe-one.vercel.app/`

## Kết quả đạt

| Hạng mục | Kết quả | Bằng chứng |
| --- | --- | --- |
| Unit/service/controller test | PASS | 19 suites, 135 tests pass |
| Prisma schema validation | PASS | `pnpm db:validate` |
| Production build | PASS | `pnpm build` |
| Production API health | PASS | `GET /api/health` trả HTTP 200 |
| Automated production API smoke | PASS with one expected skip | BAT/PowerShell: 18 PASS, 1 SKIP; no token is written to report |
| Production Admin login/profile | PASS | Login và `GET /api/auth/me` trả HTTP 200 |
| Production Student login/profile | PASS | Login và `GET /api/auth/me` trả HTTP 200 |
| Production Admin read APIs | PASS | Users, Subjects, Materials, Exams, Assignments, Attempts đều HTTP 200 |
| Production Student read APIs | PASS | Subjects, Materials, Exams, Assignments, Attempts đều HTTP 200 |
| Production full learning flow trên dữ liệu `TEST_` | PASS một phần | 4 answer lưu thành công; submit tạo `COMPLETED`; Student/Admin cùng đọc result `3/4 (75%)` |
| Frontend interactive Student flow bằng agent-browser | PASS một phần | Login → dashboard → result → assignment filter → materials → profile → logout đều thực hiện được |
| Missing-token protection | PASS | `GET /api/subjects` không token trả HTTP 401 |
| Student/Admin role protection | PASS | Student gọi `/api/users` trả HTTP 403 |
| Frontend/backend CORS | PASS | Preflight trả HTTP 204, origin frontend được cho phép |
| Frontend HTML | PASS | HTTP 200, title đúng |
| Frontend JS/CSS assets | PASS | Asset chính đều HTTP 200 |

Production API smoke vẫn là read-only. Riêng full learning flow đã dùng attempt `TEST_` đang `IN_PROGRESS` có sẵn: đăng nhập Student → lấy exam/questions → lưu 4 đáp án → submit → đọc result bằng Student và Admin. Không tạo exam, user hoặc assignment mới. Thời gian response đơn lẻ ghi nhận khoảng 0.31–1.63 giây; đây không phải kết quả load test.

## Chi tiết full learning flow

| Bước | Kết quả |
| --- | --- |
| Student login, exam detail, questions | PASS; HTTP 200 |
| Start khi assignment hiện tại đã quá hạn | PASS nhánh bảo vệ; HTTP 403 đúng kỳ vọng |
| Kiểm tra attempt đang dở | PASS; `IN_PROGRESS`, chưa có answer |
| Lưu 4 answer | PASS; 4/4 request HTTP 201 |
| Submit attempt | PASS; attempt chuyển `COMPLETED` |
| Đọc result bằng Student | PASS; HTTP 200, `3/4`, `75%` |
| Đọc result/attempt bằng Admin | PASS; HTTP 200, cùng kết quả `3/4` và đủ 4 answer |

## Browser interactive verification

Đã chạy bằng `pnpm dlx --yes agent-browser` trên frontend production:

- Student login chuyển tới `/student`; dashboard hiển thị lịch sử làm bài và điểm `7.5/10`.
- Mở trang result chuyển tới `/student/attempts/{id}/result`; UI hiển thị `3/4`, `75%`, trạng thái `Đã hoàn thành` và chi tiết 4 câu.
- Nút quay về danh sách chuyển tới `/student/assignments`; bộ lọc `Đã quá hạn` hiển thị đúng đề `TEST_Exam_Published_Free` và nút làm bài bị disabled.
- Trang Tài liệu học tập, Hồ sơ cá nhân và thao tác Đăng xuất đều hoạt động.
- Không chạy thao tác `Luyện tập lại đề này` vì sẽ tạo/khởi động thêm attempt production; nhánh start mới hiện bị assignment quá hạn chặn đúng theo API.

### Phát hiện lỗi dữ liệu chấm điểm

Câu hỏi multiple-choice ở vị trí 3 có `correctTextAnswer = "Lẩu Thái"`, nhưng option `"Lẩu Thái"` đang có `isCorrect = false` và option `"Phở Việt"` có `isCorrect = true`. Code chấm multiple-choice theo `isCorrect`, vì vậy chọn `"Lẩu Thái"` bị chấm sai. Đây là lỗi dữ liệu/fixture cần sửa trước khi nghiệm thu điểm số.

## Coverage baseline

`pnpm test:cov` pass với:

- Statements: 69.30%
- Branches: 60.51%
- Functions: 53.77%
- Lines: 70.14%

Coverage hiện là baseline, không dùng riêng làm tiêu chí nghiệm thu. Các vùng còn thấp gồm Attempts, Storage/GCS, Prisma bootstrap và một số controller.

## Blocker và phạm vi chưa hoàn tất

1. Chưa hoàn tất nhánh tích hợp assignment → attempt theo chiều thành công: assignment `TEST_` hiện có đã quá hạn nên API start trả HTTP 403. Nhánh answer → submit → result đã chạy đầy đủ trên attempt `TEST_` có sẵn.
2. Chưa chạy UI Admin và chưa chạy được nhánh Student start → answer trên một assignment còn hiệu lực; assignment test hiện tại đã quá hạn. Student UI read/result/navigation đã được xác nhận bằng agent-browser.
3. Chưa xác nhận build metadata qua endpoint version vì backend hiện chưa expose endpoint này; script ghi nhận `SMK-002` là SKIP.
4. Local health trả HTTP 500 với `ECONNREFUSED` từ Prisma vì database local không có listener. Docker daemon cũng chưa chạy; `.env` local có `DATABASE_URL` không hợp lệ với parser hiện tại.
5. Chưa có staging URL trong workspace, nên chưa thực hiện được các test mutation, GCS upload/download đầy đủ và performance/security test trên staging.
6. Dữ liệu câu hỏi nêu ở trên làm điểm của đáp án đúng theo nội dung bị chấm sai (`3/4` thay vì `4/4`).

## Kết luận nghiệm thu

**Trạng thái: FAIL — chưa đủ điều kiện đóng release P0.**

Availability production, Admin/Student read paths, role protection, CORS, frontend static delivery và các endpoint chính của learning flow đang hoạt động. Tuy nhiên cần sửa dữ liệu đáp án, xác nhận lại điểm số, chạy nhánh assignment thành công và thực hiện UI interactive trước khi kết luận release đạt hoàn toàn.

## Harness đã bổ sung

- `scripts/smoke-test.bat`: entry point cho Windows/CI.
- `scripts/smoke-test.ps1`: API smoke, exit code `0/1/2`, không ghi token vào report.
- `docs/testing/SMOKE_TEST.md`: hướng dẫn chạy.
- `docs/testing/TEST_PLAN.md`: phạm vi và tiêu chí kiểm thử.
