# Cấu hình môi trường và tích hợp Lark

[.env.example](../.env.example) là danh sách mẫu để bắt đầu, không phải cấu hình production. Biến không chứa tiền tố `NEXT_PUBLIC_` không được đưa vào bundle trình duyệt.

## Cấu hình chính

| Nhóm | Biến | Ý nghĩa |
| --- | --- | --- |
| Web/API | `API_PORT`, `PUBLIC_APP_URL`, `APP_PUBLIC_ORIGIN` | Cổng API và địa chỉ ứng dụng |
| BFF | `CRM_API_INTERNAL_URL`, `NEXT_PUBLIC_API_URL` | URL API nội bộ và URL công khai |
| Domain | `PUBLIC_WEB_URL`, `CRM_API_CORS_ORIGINS` | Redirect và danh sách origin được phép |
| Native Auth | `CRM_AUTH_PUBLIC_ORIGIN`, `CRM_AUTH_ENCRYPTION_KEY`, `CRM_AUTH_MAIL_*`, `CRM_LOCAL_AUTH_ENABLED` | Origin tin cậy, khóa MFA và cơ chế gửi thư đăng ký/khôi phục |
| Lark callback | `LARK_OAUTH_REDIRECT_URIS`, `CRM_ENABLE_DIRECT_LARK_SESSION` | Danh sách callback cho phép và luồng session trực tiếp chỉ dành cho môi trường kiểm soát |
| PostgreSQL | `DATABASE_URL`, `MIGRATION_DATABASE_URL` | Kết nối app và kết nối migration riêng |
| Docker DB | `POSTGRES_*`, `APP_DATABASE_*` | Chủ database và role runtime tối thiểu |
| Redis | `REDIS_URL`, `APP_REDIS_URL`, `REDIS_PASSWORD` | Kết nối trên host và trong Docker |
| Dữ liệu nền | `FOUNDATION_TENANT_KEY`, `FOUNDATION_WORKSPACE_*`, `FOUNDATION_ADMIN_*` | Workspace và quản trị viên do chủ hệ thống chỉ định |
| An toàn | `CRM_DEMO_AUTH_ENABLED`, `CRM_ENABLE_DEMO_SESSION`, `CRM_ENABLE_DIRECT_LARK_SESSION`, `CRM_ALLOW_PRINCIPAL_FALLBACK` | Luồng demo/direct/fallback; phải false trên production |
| Analytics | `WORKFORCE_ANALYTICS_GA_ENABLED` | Feature gate; mặc định false cho tới khi đủ dữ liệu và nghiệm thu |
| Quan sát | `CRM_READY_DETAIL_ENABLED` | Không công khai chi tiết hạ tầng qua readiness |
| Tệp | `CRM_FILE_STORAGE_ROOT`, `CRM_MAX_UPLOAD_BYTES` | Kho tệp bền vững và giới hạn tải lên |
| Image | `IMAGE_REGISTRY`, `IMAGE_TAG` | Registry chữ thường và tag SHA bất biến |

Mật khẩu có ký tự đặc biệt phải được URL-encode trong URL kết nối. Không đưa raw secret vào lệnh có thể lưu trong lịch sử shell hoặc log CI. `PUBLIC_WEB_URL`, `CRM_AUTH_PUBLIC_ORIGIN` và `LARK_OAUTH_REDIRECT_URIS` phải mô tả chính xác các origin/callback tin cậy. Ứng dụng chỉ chấp nhận forwarded host nằm trong allowlist này; không để reverse proxy chuyển host tùy ý từ Internet thành redirect Auth.

Mẫu VPS còn tên container/network và một số fallback domain kế thừa. Cần rà toàn bộ `ops/` trước triển khai; file mẫu không tự tạo role PostgreSQL tối thiểu hay tự di trú hệ thống cũ.

## Đăng nhập Lark

Source nằm ở `apps/api/src/modules/identity-access/lark-auth.service.ts` và các route BFF xác thực của web.

- `LARK_APP_ID`, `LARK_APP_SECRET`: app của đúng tenant.
- `LARK_OAUTH_STATE_SECRET`: secret ngẫu nhiên mạnh, riêng biệt, không dùng giá trị mẫu.
- `LARK_OAUTH_SCOPES`: quyền OAuth theo nhu cầu và tài liệu Lark hiện hành.
- `LARK_ALLOWED_TENANT_KEYS`: giới hạn tenant được phép.
- `FOUNDATION_ADMIN_LARK_OPEN_IDS`: identity quản trị viên được chủ hệ thống xác nhận.
- `CRM_LARK_AUTO_PROVISION=false`: mặc định không tự tạo người dùng toàn tổ chức.
- `CRM_LARK_DEFAULT_ROLE_CODE`: role dùng khi chủ động cho phép provisioning.

Quyền cấu hình ở app, phạm vi dữ liệu danh bạ và quyền/RoleBinding trong CRM là các lớp khác nhau. Không dùng `open_id` từ app khác một cách tùy ý vì định danh phụ thuộc app.

Phải đăng ký đúng callback HTTPS theo domain thực và cấu hình proxy. Trước thao tác thật, đối chiếu [tài liệu chính thức Lark](https://open.larksuite.com/document/) và schema CLI; bản tiếp nhận source này không xác nhận app Lark của bạn đã được cấp đủ scope.

## Native Auth và vòng đời tài khoản

Native Auth không mở đăng ký công khai. Founder tạo lời mời, người nhận kích hoạt tài khoản qua liên kết giới hạn thời gian; các luồng xác minh email, quên/đặt lại mật khẩu, MFA và quản lý phiên dùng action token một lần.

- `CRM_AUTH_ENCRYPTION_KEY` phải là 32 byte ngẫu nhiên mã hóa thành 64 ký tự hex, giữ ổn định và sao lưu an toàn. Thay khóa tùy tiện có thể làm mất khả năng giải mã MFA hiện có.
- `CRM_AUTH_MAIL_MODE=smtp` cần `CRM_AUTH_MAIL_FROM` và `CRM_AUTH_SMTP_URL`. Chưa có SMTP thì chức năng gửi lời mời/khôi phục không hoàn chỉnh.
- `CRM_AUTH_MAIL_SPOOL` chỉ dành cho phát triển cục bộ có kiểm soát; không dùng làm hộp thư production.
- `CRM_LOCAL_AUTH_ENABLED` chỉ bật khi chủ hệ thống quyết định cho phép Native Auth ở đúng môi trường.
- Mọi origin mutation phải trùng origin tin cậy. Header proxy giả mạo hoặc origin ngoài allowlist phải bị từ chối.

## Đồng bộ danh bạ

`LARK_DIRECTORY_SYNC_ENABLED=false` theo mặc định. Root đồng bộ do `LARK_CDS_DEPARTMENT_ID` và `LARK_CDS_DEPARTMENT_ID_TYPE` quyết định; không mặc định root của tổ chức khác.

- Chạy `pnpm db:sync:lark-cds-users` là bước preview theo script hiện tại, nhưng vẫn có thể đọc Lark/database thật nếu bạn cấu hình credentials thật.
- Chỉ dùng `--apply` khi đã xem preview và được phép ghi vào workspace mục tiêu.
- Luồng hiện tại bổ sung danh bạ/identity; không tự đình chỉ người dùng bị thiếu.
- Worker có interval, lease/heartbeat, timeout và retry cấu hình qua `LARK_DIRECTORY_*`.
- Không giả định người được đồng bộ đã có quyền dùng mọi dự án.

Lần xuất bản này chỉ tham khảo CLI `lark-cli --version`; không đăng nhập, không gọi tài nguyên Lark, không đổi profile/identity hoặc cấp scope.
