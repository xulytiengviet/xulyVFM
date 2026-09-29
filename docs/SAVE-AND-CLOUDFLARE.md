# Lưu kết quả và kết nối Cloudflare

## Sửa lỗi showSaveFilePicker

Chuyển đổi không mở hộp thoại lưu. Kết quả được giữ dưới dạng Blob trong bộ nhớ tab và hiển thị panel riêng:

- **Tải xuống thông thường**: tải bằng cơ chế download của trình duyệt, có thể lặp lại.
- **Lưu thành…**: gọi showSaveFilePicker trực tiếp trong sự kiện bấm nút, trước bất kỳ await nào.
- Đóng/hủy hộp thoại (`AbortError`) chỉ báo chưa lưu, không tự tải file và không xóa kết quả.
- `SecurityError`/`NotAllowedError` hướng dẫn chọn tải thông thường.
- Lỗi ghi ổ đĩa khác được báo là lỗi lưu; kết quả vẫn được giữ.
- **Xóa kết quả** giải phóng tham chiếu tới Blob. Đóng hoặc tải lại tab sẽ mất kết quả; chuyển đổi thành công mới thay kết quả cũ. Chuyển đổi lỗi giữ kết quả cũ.

Đường lưu khóa ký và trích xuất file đã xác minh dùng download thông thường. Không thay đổi nội dung ba chế độ đầu ra.

## Backend Cloudflare chuẩn bị sẵn

Giao diện có URL backend, mã truy cập, kiểm tra kết nối và ngắt kết nối. Không mặc định coi một URL HTTPS là backend đang hoạt động. `/health` yêu cầu token và kiểm tra container có GDAL. Chỉ sau khi kết nối đạt mới định tuyến tác vụ nặng lên backend, và vẫn hỏi đồng ý gửi file. Không lưu token vào localStorage, URL, log hay file dữ liệu.

**Mã truy cập backend là một secret riêng do chủ dịch vụ quản lý, không phải Cloudflare API token.** Đây là cơ chế truy cập dịch vụ riêng ban đầu, chưa phải hệ thống tài khoản/ACL nhiều người dùng. CORS không được coi là xác thực. Khi chưa có BACKEND_TOKEN hợp lệ, Worker trả 503, không nhận chuyển đổi.

### Triển khai

Repo có workflow thủ công **Deploy private Cloudflare GDAL backend**. Tạo các GitHub environment secrets trong `cloudflare-production`:

- `CLOUDFLARE_API_TOKEN`: token triển khai có quyền cần thiết cho Workers/Containers của tài khoản đã chọn. Không gửi token này vào giao diện xulyVFM hoặc chat.
- `CLOUDFLARE_ACCOUNT_ID`: tài khoản đích.
- `XULYVFM_BACKEND_TOKEN`: secret ngẫu nhiên ít nhất 32 ký tự, được cài vào Worker dưới tên `BACKEND_TOKEN`.

Chạy workflow sau khi tài khoản đã cho phép Containers và chấp nhận chi phí tương ứng. Workflow không chạy khi push. Worker mới chưa cài secret sẽ fail closed. Khi deploy thành công, lấy URL thực từ log Wrangler, nhập vào giao diện xulyVFM và kiểm tra kết nối bằng mã backend. Không đoán URL workers.dev.

Cấu hình hiện tại cho phép origin GitHub Pages `https://xulytiengviet.github.io`; đổi ALLOWED_ORIGIN nếu chuyển frontend sang tên miền khác.

### Giới hạn triển khai hiện tại

- Tệp upload/đầu ra được giới hạn để có thể giữ kết quả trong RAM; đầu ra trên 90 MB bị từ chối thay vì làm treo tab.
- Native GDAL dùng file tạm trong container, dọn sau request. Chưa có R2/Workflows/D1 production bindings.
- Không có quyền đọc dữ liệu theo từng chủ sở hữu; chế độ chữ ký không mã hóa dữ liệu.
- Việc có mã và workflow không chứng minh đã tạo dịch vụ trong tài khoản Cloudflare. Cần xác minh lần deploy và `/health` thực.

## Giai đoạn R2 cho file lớn — chưa bật

Dùng R2 private + Worker xác thực + tác vụ GDAL + D1 metadata. Trình duyệt nhận URL upload có thời hạn, upload multipart cho tệp lớn; backend đọc nguồn, ghi đầu ra vào R2; giao diện nhận URL download có thời hạn thay vì đưa cả file qua Blob. Workflows có thể điều phối retry, timeout và dọn dữ liệu. Cần chính sách retention, hạn mức và xác thực theo người dùng trước khi cung cấp rộng rãi.

Không bật public bucket. URL đã ký là bearer credential trong thời gian hiệu lực; không tự bảo vệ thuộc tính sau khi file tải xuống. Muốn chủ sở hữu phê duyệt đọc thuộc tính cần encryption + quản lý khóa riêng.
