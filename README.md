# xulyVFM — VFM Decoder + CVNSS4.0

Ứng dụng web tĩnh giải mã tệp `.vfm` trực tiếp trong trình duyệt.

- VFM Core 1.3: magic/header/directory/META/PROF/HASH, CRC32C và SHA-256.
- Profile mở rộng: `org.xulytiengviet.vfm.feature-cvnss4/1`.
- Text tiếng Việt: Unicode là giá trị gốc; `cv4` là khóa dẫn xuất theo CVNSS4.0 5.0.0-audit-safe.
- Không tải tệp VFM lên máy chủ: đọc bằng File API trong trình duyệt.
- Trang chính chỉ cần kéo/thả hoặc chọn tệp VFM để giải mã.
- `convert.html` là công cụ phụ để chuyển KML sang VFM theo profile trên.

Chuẩn Core tham chiếu: https://github.com/Base27-CVNSS/VFM

CVNSS4.0 Converter: https://github.com/xulytiengviet/CVNSS4.0

## Cấu trúc

```
index.html                 VFM decoder UI
convert.html               KML -> VFM utility
assets/cvnss-converter.js  CVNSS4.0 5.0.0 audit-safe
src/cbor.js                deterministic CBOR subset
src/vfm-core.js            VFM Core 1.3 reader + verifier
src/vfm-writer.js          VFM Core 1.3 writer for Feature+CVNSS profile
src/app.js                 decoder UI
src/convert.js             KML -> VFM
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
