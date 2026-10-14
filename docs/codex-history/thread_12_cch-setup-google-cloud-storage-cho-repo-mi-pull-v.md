# Conversation #12: Cách setup Google Cloud Storage cho repo mới pull về

- **Thread ID:** `01a04298-b6e5-7d83-8879-fed703d3a21e`
- **Created At:** 2026-08-27T09:41:39.000Z
- **Updated At:** 2026-08-27T09:48:33.000Z
- **Working Directory:** `\\?\D:\Project\CourseManagement`
- **Model:** `gpt-5.6-luna`
- **Messages:** 5 User, 7 Assistant (Total: 12)

---

### 👤 User _(2026-08-27T09:41:56.294Z)_

Cách setup Google Cloud Storage cho repo mới pull về

---

### 🤖 Codex Assistant _(2026-08-27T09:41:59.120Z)_

Mình sẽ kiểm tra cấu trúc repo và các biến môi trường/tài liệu hiện có để hướng dẫn đúng cách setup GCS cho project này, tránh đoán sai tên bucket hoặc credential.

---

### 🤖 Codex Assistant _(2026-08-27T09:42:17.692Z)_

Repo này đã có sẵn `GcsStorageService` và endpoint upload; mình đang đối chiếu thêm quyền IAM tối thiểu để bạn setup bucket/service account an toàn cho local và production.

---

### 🤖 Codex Assistant _(2026-08-27T09:42:34.250Z)_

Repo này đã tích hợp sẵn Google Cloud Storage cho upload tài liệu tại `POST /api/materials/upload`.

### 1. Tạo bucket và service account

Thay các giá trị mẫu bằng project/bucket thật:

```powershell
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

gcloud services enable storage.googleapis.com

gcloud storage buckets create gs://YOUR_UNIQUE_BUCKET_NAME `
  --project=YOUR_PROJECT_ID `
  --location=asia-southeast1 `
  --uniform-bucket-level-access

gcloud iam service-accounts create course-management-storage `
  --project=YOUR_PROJECT_ID `
  --display-name="Course Management Storage"

gcloud storage buckets add-iam-policy-binding gs://YOUR_UNIQUE_BUCKET_NAME `
  --member="serviceAccount:course-management-storage@YOUR_PROJECT_ID.iam.gserviceaccount.com" `
  --role="roles/storage.objectUser"
```

`roles/storage.objectUser` đủ cho ứng dụng tạo, đọc và xóa object trong bucket. Bucket nên để private vì backend trả về Signed URL có thời hạn. [Google Cloud IAM roles](https://docs.cloud.google.com/storage/docs/access-control/iam-roles)

### 2. Tạo credential cho local

```powershell
New-Item -ItemType Directory -Force C:\secure | Out-Null

gcloud iam service-accounts keys create C:\secure\course-management-storage.json `
  --iam-account=course-management-storage@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

Không đặt file JSON trong repo và không commit lên Git. Repo đã ignore `.env`, nhưng nên giữ credential ở `C:\secure`.

### 3. Cấu hình `.env`

Trong `D:\Project\CourseManagement`:

```powershell
Copy-Item .env.example .env
```

Sửa `.env`:

```env
PORT=5001

DATABASE_URL="postgresql://..."

JWT_SECRET="một-chuỗi-ngẫu-nhiên-dài"
JWT_EXPIRES_IN="1d"

GCP_PROJECT_ID="YOUR_PROJECT_ID"
GCS_BUCKET_NAME="YOUR_UNIQUE_BUCKET_NAME"
GOOGLE_APPLICATION_CREDENTIALS="C:/secure/course-management-storage.json"
```

Google Cloud Storage client hỗ trợ ADC và biến `GOOGLE_APPLICATION_CREDENTIALS` cho local development. [Google Cloud authentication](https://docs.cloud.google.com/storage/docs/authentication)

### 4. Chạy repo

```powershell
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

API chạy tại:

```text
http://localhost:5001/api
```

Upload cần:

- Header `Authorization: Bearer <admin-token>`
- `multipart/form-data`
- Field `file`: PDF/DOCX, tối đa 25 MB
- `subjectId`
- `title`
- `accessLevel`: `FREE` hoặc `PRO`

Ví dụ:

```powershell
curl.exe -X POST http://localhost:5001/api/materials/upload `
  -H "Authorization: Bearer ADMIN_TOKEN" `
  -F "file=@C:\temp\document.pdf" `
  -F "subjectId=SUBJECT_ID" `
  -F "title=Tài liệu Toán" `
  -F "accessLevel=FREE"
```

File được lưu dưới dạng private object, database lưu `gs://...`, và endpoint `/api/materials/:id/download` trả Signed URL trong 15 phút.

---

### 👤 User _(2026-08-27T09:43:18.972Z)_

Nếu hiện tại đã có service account sẵn của GCS thì setup như thế nào?

---

### 🤖 Codex Assistant _(2026-08-27T09:43:26.920Z)_

Nếu đã có Service Account rồi thì không cần tạo mới. Repo hiện đọc 3 biến:

```env
GCP_PROJECT_ID="YOUR_PROJECT_ID"
GCS_BUCKET_NAME="YOUR_BUCKET_NAME"
GOOGLE_APPLICATION_CREDENTIALS="C:/secure/gcs-service-account.json"
```

### Trường hợp chạy local

1. Lấy email Service Account:

```powershell
gcloud iam service-accounts list --project=YOUR_PROJECT_ID
```

2. Cấp quyền cho Service Account trên bucket:

```powershell
gcloud storage buckets add-iam-policy-binding gs://YOUR_BUCKET_NAME `
  --member="serviceAccount:YOUR_SERVICE_ACCOUNT_EMAIL" `
  --role="roles/storage.objectUser"
```

Quyền này cho phép app upload, đọc và xóa file.

3. Nếu đã có file JSON key, đặt ngoài repo, ví dụ:

```text
C:\secure\gcs-service-account.json
```

Sau đó cấu hình `.env`:

```env
GCP_PROJECT_ID="course-management-2026"
GCS_BUCKET_NAME="course-media-bucket"
GOOGLE_APPLICATION_CREDENTIALS="C:/secure/gcs-service-account.json"
```

Chạy lại backend:

```powershell
pnpm dev
```

Không commit file JSON vào Git. Repo đã ignore `.env`.

### Nếu chưa có file JSON key

Không thể tải lại private key cũ. Có thể tạo key mới cho Service Account hiện tại:

```powershell
gcloud iam service-accounts keys create C:\secure\gcs-service-account.json `
  --iam-account=YOUR_SERVICE_ACCOUNT_EMAIL `
  --project=YOUR_PROJECT_ID
```

Cần quyền tạo service-account key. Google khuyến nghị dùng ADC hoặc gắn trực tiếp Service Account vào Cloud Run/Compute khi chạy production, thay vì lưu JSON key. [Google Cloud authentication](https://docs.cloud.google.com/storage/docs/authentication)

### Nếu deploy Cloud Run

Không cần `GOOGLE_APPLICATION_CREDENTIALS`. Gắn Service Account đó cho Cloud Run, rồi chỉ cần:

```env
GCP_PROJECT_ID="YOUR_PROJECT_ID"
GCS_BUCKET_NAME="YOUR_BUCKET_NAME"
```

Code trong [gcs-storage.service.ts](D:/Project/CourseManagement/src/storage/gcs-storage.service.ts) sẽ tự dùng credential của môi trường Google Cloud.

---

### 👤 User _(2026-08-27T09:44:17.812Z)_

Chỉ cần có file json key là có thể access vào GCS?

---

### 🤖 Codex Assistant _(2026-08-27T09:44:22.711Z)_

Không hẳn. File JSON key chỉ xác thực bạn là Service Account nào; Service Account đó vẫn phải được cấp quyền IAM trên bucket.

Với repo này cần:

```powershell
gcloud storage buckets add-iam-policy-binding gs://BUCKET_NAME `
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" `
  --role="roles/storage.objectUser"
```

Sau đó `.env`:

```env
GCP_PROJECT_ID="YOUR_PROJECT_ID"
GCS_BUCKET_NAME="BUCKET_NAME"
GOOGLE_APPLICATION_CREDENTIALS="C:/secure/gcs-service-account.json"
```

Ngoài ra cần:

- Bucket tồn tại và tên chính xác.
- API Cloud Storage đã bật.
- JSON key thuộc đúng Service Account được cấp quyền.
- Với code hiện tại, `roles/storage.objectUser` hỗ trợ upload, đọc, xóa và tạo Signed URL trong điều kiện credential có khả năng ký.

Có thể kiểm tra key:

```powershell
gcloud auth activate-service-account `
  --key-file=C:\secure\gcs-service-account.json

gcloud storage ls gs://BUCKET_NAME
```

Nếu lệnh trên lỗi `403`, thường là Service Account chưa được cấp IAM role. Nếu key bị lộ, người khác có thể sử dụng quyền của Service Account đó; cần thu hồi và tạo key mới ngay.

---

### 👤 User _(2026-08-27T09:44:47.230Z)_

Nếu tôi đưa json key cho người khác mà json key đó đã được kích hoạt thành công?

---

### 🤖 Codex Assistant _(2026-08-27T09:44:55.065Z)_

Có. Nếu bạn đưa file JSON key cho người khác, họ có thể dùng nó để đăng nhập dưới danh nghĩa Service Account đó từ máy khác:

```powershell
gcloud auth activate-service-account `
  --key-file=service-account.json
```

Việc bạn đã kích hoạt thành công trên máy mình không làm key bị khóa theo máy. Người kia vẫn dùng được key miễn là:

- Key chưa bị xóa hoặc vô hiệu hóa.
- Service Account còn hoạt động.
- Service Account vẫn có quyền trên bucket.

Tuy nhiên, kích hoạt thành công chỉ chứng minh key hợp lệ; quyền truy cập thực tế vẫn phụ thuộc IAM.

Nếu đã gửi key và không muốn tiếp tục cho phép sử dụng:

```powershell
gcloud iam service-accounts keys list `
  --iam-account=SERVICE_ACCOUNT_EMAIL
```

Sau đó xóa key bị lộ:

```powershell
gcloud iam service-accounts keys delete KEY_ID `
  --iam-account=SERVICE_ACCOUNT_EMAIL
```

Tốt nhất không chia sẻ JSON key. Hãy cấp quyền bucket cho Google Account của người đó hoặc dùng Service Account impersonation. Nếu key đã bị gửi cho người khác, nên tạo key mới cho ứng dụng rồi xóa key cũ.

---

### 👤 User _(2026-08-27T09:48:22.481Z)_

Nếu muốn update một branch thì git convention như thế nào?

---

### 🤖 Codex Assistant _(2026-08-27T09:48:26.448Z)_

Convention phổ biến khi update một branch:

### Cập nhật branch local từ remote

```powershell
git fetch origin
git switch ten-branch
git pull --rebase origin ten-branch
```

`--rebase` giúp lịch sử commit thẳng, tránh tạo merge commit không cần thiết.

### Nếu branch đang làm việc dựa trên `main`

```powershell
git fetch origin
git switch feature/upload-gcs
git rebase origin/main
```

Nếu có conflict:

```powershell
git status
# sửa file bị conflict
git add .
git rebase --continue
```

Hủy rebase nếu cần:

```powershell
git rebase --abort
```

### Đẩy branch sau khi rebase

```powershell
git push --force-with-lease origin feature/upload-gcs
```

Dùng `--force-with-lease`, không dùng `--force` vì an toàn hơn.

### Quy ước đặt tên branch

```text
feature/<ten-tinh-nang>
fix/<ten-loi>
refactor/<ten-pham-vi>
chore/<ten-cong-viec>
docs/<ten-tai-lieu>
```

Ví dụ:

```text
feature/gcs-upload
fix/material-download-url
chore/update-env-example
```

Không nên sửa trực tiếp `main`; nên tạo branch riêng, commit, push rồi mở Pull Request. Commit cũng nên ngắn và rõ:

```text
feat: add GCS material upload
fix: handle missing storage credentials
chore: update environment example
```

Nếu branch là branch dùng chung, ưu tiên:

```powershell
git pull --rebase origin ten-branch
```

và tránh force push.

---

