# Ba chế độ đầu ra

1. **Bình thường**: giữ nguyên giá trị thuộc tính nhập vào, bỏ bản `cv4` phụ trong payload xuất. Không tự giải mã nội dung đã là CVNSS4.0 từ nguồn. `none` nghĩa là không mã hóa; `nonce` là tham số mật mã, không phải chế độ này.
2. **Mã hóa nhẹ / CVNSS4.0**: chuyển trực tiếp giá trị text trong thuộc tính (cả object/array lồng nhau); chọn các trường cấp đầu tiên bằng danh sách tên. Giữ geometry, tên trường, số, boolean và null. ID, mã định danh, URL, email, điện thoại có tên trường thông dụng được giữ nguyên. Không xuất bản Unicode dự phòng trong `cv4`. Đây là chuyển biểu diễn, không có tính bí mật hoặc kiểm soát quyền đọc. Không tự khôi phục nguyên văn HTML/khoảng trắng và không hứa round-trip tuyệt đối. Chỉ áp dụng vector.
3. **Hash + chữ ký**: giữ thuộc tính như chế độ thường, đóng gói file đã xuất vào `.vfms` cùng manifest SHA-256, chữ ký ECDSA P-256/SHA-256 và khóa công khai. Gói này không mã hóa dữ liệu. Xác minh tại giao diện rồi tải lại file GIS chuẩn để dùng với QGIS/Google Earth. Với shapefile, file được ký là ZIP chứa bộ sidecar.

## Danh tính và quyền sở hữu

Hash tự chứa không chứng minh chủ sở hữu. Chữ ký xác minh bên giữ khóa riêng đã ký đúng bytes và metadata. Tên người ký là thông tin tự khai báo; thời gian là đồng hồ phía người ký, không phải timestamp được chứng thực. Người nhận cần lấy dấu vân tay khóa qua kênh độc lập đáng tin cậy và nhập vào ô xác minh. Nếu không nhập, giao diện chỉ báo chữ ký hợp lệ, **chưa xác minh danh tính**. Không khẳng định quyền sở hữu pháp lý, không có cơ quan cấp chứng thư hoặc registry danh tính.

Khóa riêng tồn tại trong bộ nhớ phiên. File `.vfmkey` bảo vệ PKCS#8 bằng PBKDF2-SHA256 (600000 vòng, salt ngẫu nhiên 16 byte) và AES-256-GCM (IV ngẫu nhiên 12 byte). Mật khẩu tạo khóa tối thiểu 12 ký tự. Không gửi khóa/mật khẩu lên backend, không lưu localStorage. Chủ sở hữu tự giữ bản sao file khóa và mật khẩu. Mất khóa không thể ký tiếp với cùng danh tính khóa.

## Gói ký v1

JSON gồm `manifest`, `signature` (base64), `data` (base64). Manifest ký bằng UTF-8 JSON với khóa object sắp xếp từ điển, không khoảng trắng; chứa type, thuật toán, tên file, MIME, tên khai báo, thời gian, byteLength, SHA-256 nội dung, publicKey và keyFingerprint. Dấu vân tay là SHA-256 canonical JSON của `{crv,kty,x,y}`. Chữ ký Web Crypto ECDSA dùng dạng IEEE P1363 64 byte. Xác minh hash và chữ ký trước khi cung cấp tải file; khóa tin cậy sai sẽ bị từ chối.

Giới hạn 90 MB dữ liệu trước đóng gói; JSON/base64 làm tăng dung lượng và bộ nhớ. Gói dùng cho trao đổi file, chưa phục vụ HTTP Range hay dataset nhiều GB.

## Giới hạn còn lại

- Không có mã hóa bí mật thuộc tính, xin quyền/phê duyệt, thu hồi khóa hay DRM. Cả ba chế độ đều không ngăn người nhận đọc/sao chép dữ liệu.
- Giao diện ma trận thể hiện khả năng khai báo; driver thực tế tùy GDAL. Không coi mọi dấu đọc/ghi là mọi cặp đã được kiểm định.
- Cầu nối GeoJSON đơn lớp phải từ chối nguồn nhiều dataset/layer được engine báo; chưa có bộ chọn layer đầy đủ.
- KML/KMZ có thể mất style, assets, overlay, model, thời gian, extension và kiểu schema. SimpleData hiện được nhập thành text.
- CRS địa phương VN-2000, Z/M, domain, topology, relationship và kiểu số lớn cần kiểm định chuyên biệt.
- Backend chỉ dùng khi endpoint đã cấu hình và người dùng đồng ý upload. Không triển khai backend mới trong thay đổi này. Origin/CORS không thay thế xác thực; cần đặt cổng xác thực/hạn mức trước backend khi đưa vào sử dụng rộng rãi.
- Gói hash/chữ ký không phải cơ chế cấp quyền. Bảo vệ thuộc tính thực sự cần một phiên bản riêng với encryption và quản lý khóa.

## Kiểm thử

`npm test` chạy smoke hiện có và kiểm thử ba chế độ, dữ liệu lồng nhau, geometry giữ nguyên, file ký round-trip, file khóa sai mật khẩu, payload/metadata bị sửa, dấu vân tay sai và giới hạn bộ nhớ. Backend chạy `go test ./...` qua CI. Chưa thay thế bộ kiểm định mọi định dạng GIS thực tế.
