# Test plan — Course Management release acceptance

## Mục tiêu

Xác nhận release đã deploy hoạt động đúng qua các boundary frontend → API → PostgreSQL/Google Cloud Storage và đủ điều kiện nghiệm thu.

## Chiến lược

- Risk-based testing, ưu tiên auth, RBAC, quyền Free/Pro, nội dung publish và luồng làm bài.
- Staging: kiểm thử đầy đủ và dùng fixture riêng.
- Production: chỉ smoke test an toàn, không CRUD, upload hoặc submit dữ liệu nghiệp vụ.
- P0: tự động bằng BAT/API và browser agent.
- P1/P2: API regression, exploratory và non-functional test theo rủi ro.

## P0 acceptance scenarios

| ID | Kịch bản | Kỳ vọng |
| --- | --- | --- |
| SMK-001 | Health check | API trả `status=ok`, database `connected` |
| SMK-003/005 | Admin/Student login | Có `accessToken`, đúng role |
| SMK-004/006 | Lấy profile | Thành công, không có `passwordHash` |
| SEC-001/002 | Thiếu token/sai role | Trả lần lượt `401`/`403` |
| FLOW-001 | Assignment → attempt → save answer → submit → result | Luồng làm bài hoàn tất và kết quả đúng |
| ACCESS-001 | Free/Pro/Pro hết hạn | Chỉ thấy nội dung được phép |
| CONTENT-001 | Publish/unpublish/soft delete | Student nhìn thấy đúng trạng thái |
| STORAGE-001 | Download material | Signed URL và quyền download đúng |

## Regression focus

- Auth: email chuẩn hóa, mật khẩu sai, tài khoản khóa, đổi mật khẩu.
- Users: search, lock/unlock, Free/Pro, không tự khóa Admin.
- Subjects/Exams/Questions: CRUD, duplicate code, publish, soft delete, reorder, đáp án.
- Materials: PDF/DOCX/video, URL YouTube, MIME type, kích thước file và signed URL.
- Assignments: duplicate, deadline, ownership và trạng thái overdue.
- Attempts: ownership, câu trắc nghiệm/tự luận, submit lặp, xem result trước submit.

## Exit criteria

- 100% P0 pass trên staging.
- Không còn Sev1; Sev2 phải được sửa hoặc có quyết định chấp thuận.
- Build/revision khớp release dự kiến.
- Production smoke pass.
- Không có lỗi bảo mật High/Critical được biết trước.

## Evidence

Mỗi lỗi cần có test ID, môi trường, version/commit, bước tái hiện, expected/actual, HTTP request/response hoặc screenshot, timestamp và log liên quan.
