# iScanner

Ứng dụng quét tài liệu và gộp PDF (Expo / React Native).

## Tính năng

- Quét nhiều trang bằng camera, sắp xếp lại thứ tự rồi tạo một file PDF.
- Chọn nhiều file PDF từ bộ nhớ và gộp thành một file PDF.
- Thư viện tài liệu: xem, đổi tên, xoá và chia sẻ PDF.

## Lưu ý quan trọng

Ứng dụng dùng module native (máy quét tài liệu, xem PDF, ...) nên **không chạy được trên Expo Go**. Cần dùng development build.

## Lệnh

```bash
npm test            # chạy unit test
npm run typecheck   # kiểm tra kiểu TypeScript
```

## Tạo development build

- Android (cần Android SDK): `npx expo run:android`
- Build bằng EAS: `npx eas-cli build --profile development --platform android` hoặc `--platform ios`

## Danh sách kiểm thử thủ công (trên thiết bị, dev build)

- [ ] Quét 3 trang -> sắp xếp lại -> PDF có 3 trang theo thứ tự mới.
- [ ] Gộp 2 file PDF.
- [ ] Đổi tên / xoá / chia sẻ tài liệu.
- [ ] Các luồng huỷ (huỷ quét, huỷ chọn file) quay lại trạng thái trước đó.
- [ ] Từ chối quyền camera trên iOS -> hiện cảnh báo "Cần quyền camera" (xác nhận lỗi quyền của scanner được nhận diện đúng).
- [ ] Kéo thả để sắp xếp lại trang / file hoạt động, số trang cập nhật đúng sau khi sắp xếp lại hoặc xoá.
- [ ] Mở share sheet với file PDF.
