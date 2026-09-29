# xulyVFM — VFM Decoder + CVNSS4.0

Ứng dụng web tĩnh chuyển đổi hai chiều `.vfm` ↔ `.kml/.kmz` và kiểm tra VFM trực tiếp trong trình duyệt.

- VFM Core 1.3: magic/header/directory/META/PROF/HASH, CRC32C và SHA-256.
- Profile mở rộng: `org.xulytiengviet.vfm.feature-cvnss4/1`.
- Text tiếng Việt: Unicode là giá trị gốc; `cv4` là khóa dẫn xuất theo CVNSS4.0 5.0.0-audit-safe.
- Không tải tệp VFM lên máy chủ: đọc bằng File API trong trình duyệt.
- Trang chính tự nhận diện VFM/KML/KMZ và hiển thị đúng chiều chuyển đổi.
- KML/KMZ → VFM: geometry + properties + CVNSS4.0, FEAT tự GZIP khi có lợi.
- VFM → KML/KMZ: xuất geometry và properties của Feature profile ngay trong browser.
- KMZ được đọc/ghi bằng ZIP trực tiếp trong trình duyệt; không cần server.
- `convert.html` giữ lại để chuyển hướng về giao diện thống nhất.

Chuẩn Core tham chiếu: https://github.com/Base27-CVNSS/VFM

CVNSS4.0 Converter: https://github.com/xulytiengviet/CVNSS4.0

## Cấu trúc

```
index.html                 Unified VFM ↔ KML/KMZ UI
convert.html               Redirect về trang chính
assets/cvnss-converter.js  CVNSS4.0 5.0.0 audit-safe
src/cbor.js                deterministic CBOR subset
src/vfm-core.js            VFM Core 1.3 reader + verifier
src/vfm-writer.js          VFM Core 1.3 writer for Feature+CVNSS profile
src/app.js                 unified conversion + inspection UI
src/geo-exchange.js        KML/KMZ serializer + ZIP reader/writer
src/convert.js             legacy KML -> VFM helper
profiles/cvnss4-feature-v1.md
.github/workflows/pages.yml
```

## Profile text

Một thuộc tính chuỗi được giữ nguyên Unicode và có khóa CVNSS4.0 tương ứng:

```json
{
  "properties": {
    "name": "An Giang"
  },
  "cv4": {
    "name": "..."
  }
}
```

CVNSS4.0 không được dùng làm stable entity ID vì ánh xạ ngược có thể mơ hồ; VFM identity và Unicode gốc vẫn là authoritative.


## Chuyển đổi hai chiều

```
KML/KMZ
  ↓ parse + CVNSS4.0
VFM Core 1.3 + FEAT
  ↓
KML hoặc KMZ
```

VFM → KML/KMZ hiện xuất các geometry và properties nằm trong Feature profile. Tài nguyên KMZ ngoài profile như ảnh, icon, overlay hay model nhúng không được tái tạo nếu chúng chưa được lưu thành VFM asset/profile tương ứng.
