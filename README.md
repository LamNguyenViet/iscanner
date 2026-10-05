# iScanner

Ứng dụng quét tài liệu và gộp PDF (Expo / React Native).

## Tính năng

- Quét nhiều trang bằng camera, sắp xếp lại thứ tự rồi tạo một file PDF.
- Chọn nhiều file PDF từ bộ nhớ và gộp thành một file PDF.
- Thư viện tài liệu: xem, đổi tên, xoá và chia sẻ PDF.

## Lưu ý quan trọng

- Ứng dụng dùng module native (máy quét tài liệu, xem PDF, ...) nên **không chạy được trên Expo Go**. Cần dùng development build (đã cài `expo-dev-client`).
- Chỉ hỗ trợ Android và iOS (không hỗ trợ web).
- Mẹo: scan rất nhiều trang độ phân giải cao (khoảng 30+ trang) có thể tốn nhiều bộ nhớ trên máy cấu hình thấp — nên chia thành nhiều tài liệu.

## Lệnh

```bash
npm test            # chạy unit test
npm run typecheck   # kiểm tra kiểu TypeScript
```

## Tạo development build

### Build bằng EAS (khuyên dùng)

Cấu hình build nằm trong `eas.json` (profile `development`, `preview`, `production`).

```bash
npx eas-cli login
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development --platform ios
```

- Android: cài file APK từ link EAS trả về lên máy.
- iOS: build cho thiết bị thật cần **tài khoản Apple Developer** (trả phí) và phải đăng ký thiết bị trước khi build: `npx eas-cli device:create`.
- Trên Windows chỉ build được iOS qua EAS (không có Xcode).

Sau khi cài development build, chạy Metro để nạp mã JS:

```bash
npx expo start --dev-client
```

### Build Android trên máy (local)

Cần cài Android SDK (Android Studio) và có thiết bị/emulator:

```bash
npx expo run:android
```

Lệnh này build, cài app và khởi động Metro; các lần sau chỉ cần `npx expo start --dev-client`.

## Danh sách kiểm thử thủ công (trên thiết bị, dev build)

- [ ] Quét 3 trang -> sắp xếp lại -> PDF có 3 trang theo thứ tự mới.
- [ ] Gộp 2 file PDF.
- [ ] Đổi tên / xoá / chia sẻ tài liệu.
- [ ] Các luồng huỷ (huỷ quét, huỷ chọn file) quay lại trạng thái trước đó.
- [ ] Từ chối quyền camera trên iOS -> hiện cảnh báo "Cần quyền camera" (hoặc, nếu máy dùng ngôn ngữ khác, "Không thể scan tài liệu" kèm nút `Mở Cài đặt`).
- [ ] Kéo thả để sắp xếp lại trang / file hoạt động, số trang cập nhật đúng sau khi sắp xếp lại hoặc xoá.
- [ ] Mở share sheet với file PDF.
- [ ] Scan ≥10 trang -> nút `Tạo PDF` vẫn nhìn thấy và bấm được (không bị đẩy khỏi màn hình).
- [ ] Android: nhấn giữ một tài liệu -> menu có `Huỷ`, đóng được bằng `Huỷ`, chạm ra ngoài hoặc nút Back.
- [ ] iOS: dung lượng app giảm sau khi xoá tài liệu / rời màn hình scan mà không tạo PDF (ảnh tạm đã bị xoá).
- [ ] Bàn phím không che các nút trên màn hình Scan và Gộp PDF khi sửa tên.
- [ ] Kéo thả để sắp xếp lại hoạt động với Reanimated 4.
