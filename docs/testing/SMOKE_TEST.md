# Smoke test

Smoke test này kiểm tra nhanh backend đã chạy đúng sau build/deploy. Script không tạo, sửa, xóa, upload hoặc submit dữ liệu.

## Phạm vi

- `GET /api/health` và kết nối database.
- Version metadata nếu cấu hình `SMOKE_VERSION_URL`.
- Đăng nhập Admin và Student.
- `GET /api/auth/me` và không lộ `passwordHash`.
- `401` khi gọi API bảo vệ không có token.
- `403` khi Student gọi API chỉ dành cho Admin.
- Các API đọc Users, Subjects, Materials, Exams, Assignments và Attempts.

## Chuẩn bị

Mở PowerShell tại thư mục repository và khai báo biến môi trường cho phiên hiện tại:

```powershell
$env:SMOKE_API_URL = 'https://<backend-domain>/api'
$env:SMOKE_ADMIN_EMAIL = '<admin-test-email>'
$env:SMOKE_ADMIN_PASSWORD = '<admin-test-password>'
$env:SMOKE_STUDENT_EMAIL = '<student-test-email>'
$env:SMOKE_STUDENT_PASSWORD = '<student-test-password>'
```

Có thể kiểm tra version nếu backend đã có endpoint version:

```powershell
$env:SMOKE_VERSION_URL = "$env:SMOKE_API_URL/version"
$env:SMOKE_EXPECTED_COMMIT = '<expected-git-sha>'
$env:SMOKE_EXPECTED_VERSION = '1.0.0'
```

Không ghi credential vào file BAT, repository hoặc log. Production chỉ dùng tài khoản test riêng.

## Chạy

```powershell
.\scripts\smoke-test.bat
```

Hoặc chạy trực tiếp PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1
```

Kết quả thành công trả về exit code `0` và in `SMOKE TEST PASSED`. Kết quả thất bại trả về exit code `1`, phù hợp để làm gate trong CI/CD. Thiếu biến đầu vào trả về exit code `2`.

Báo cáo JSON không chứa token được ghi vào thư mục tạm của hệ điều hành, trừ khi chỉ định `SMOKE_ARTIFACT_DIR`.
