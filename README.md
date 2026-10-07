# iScanner

Ứng dụng quét tài liệu và gộp PDF (Expo / React Native).

## Tính năng

- Quét nhiều trang bằng camera, sắp xếp lại thứ tự rồi tạo một file PDF.
- Chọn nhiều file PDF từ bộ nhớ và gộp thành một file PDF.
- Thư viện tài liệu: xem, đổi tên, xoá và chia sẻ PDF.
- (1.1.0) **Chỉnh trang** sau khi scan: kéo 4 góc để cắt sát (làm phẳng phối cảnh), `Tự cắt sát` (OpenCV dò mép), `Toàn ảnh`, `Xoay ⟳`, `Chụp lại` một trang.
- (1.1.0) **Bố cục PDF**: khổ giấy `A4` / `Letter` / `Theo ảnh`, lề `Không` / `Nhỏ` / `Vừa`, căn từng trang `Trên` / `Giữa` / `Dưới` / `Lấp đầy` (có xem trước).
- (1.1.0) **Ảnh Full HD**: mỗi trang được thu nhỏ về cạnh dài tối đa 1920 px (không phóng to ảnh nhỏ), làm nét và lưu JPEG chất lượng 95.
- (1.2.0) **Nhận file chia sẻ** từ Zalo và app khác: Android — iScanner có trong menu Chia sẻ (PDF, ảnh, một hoặc nhiều file) và "Mở bằng" cho PDF/ảnh; iOS — "Mở bằng / Sao chép vào iScanner". 1 PDF → `Lưu vào thư viện` hoặc `Gộp với file khác`; nhiều PDF → màn Gộp PDF; ảnh → màn review scan; vừa PDF vừa ảnh → gộp PDF trước rồi tới scan ảnh. File không hỗ trợ hoặc > 100 MB bị bỏ qua (có thông báo).

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

### Cài lên iPhone thật không cần Apple Developer (IPA chưa ký + Apple ID miễn phí)

GitHub Actions (`.github/workflows/ios-unsigned-ipa.yml`) build bản **Release chưa ký** trên máy macOS của GitHub (JS đã nhúng sẵn, không cần Metro). Workflow chạy khi push lên `main` hoặc bấm **Run workflow** trong tab **Actions**.

1. Vào tab **Actions** → run mới nhất của *iOS unsigned IPA* → tải artifact `iScanner-unsigned-ipa` (giải nén ra `iScanner-unsigned.ipa`).
2. Trên Windows cài **Apple Devices** (hoặc iTunes) và **[Sideloadly](https://sideloadly.io)**.
3. Cắm iPhone qua USB, mở Sideloadly, kéo file `.ipa` vào, nhập Apple ID (tài khoản thường, miễn phí) → **Start**. Sideloadly ký lại bằng Apple ID của bạn và cài app.
4. Trên iPhone: **Cài đặt → Quyền riêng tư & Bảo mật → Chế độ nhà phát triển** → bật (máy khởi động lại); rồi **Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị** → tin cậy Apple ID của bạn.

Giới hạn của Apple ID miễn phí: app hết hạn sau **7 ngày** (cài lại bằng Sideloadly để gia hạn), tối đa 3 app sideload cùng lúc.

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
- [ ] (1.1.0) Scan bằng camera thật 12MP → file trang trong cache có cạnh dài ≤ 1920 px, chữ rõ nét; scan 10 trang không bị thoát app do thiếu bộ nhớ.
- [ ] (1.1.0) `Sửa` một trang → 4 góc nằm sát mép giấy (hoặc toàn ảnh nếu không dò được); kéo cả 4 góc (kể cả ở mép ảnh) → `Xong` → ảnh được cắt và làm phẳng đúng.
- [ ] (1.1.0) Trang có bảng/khung bên trong: mở `Sửa` rồi chỉ đổi căn → `Xong` → nội dung **không** bị cắt mất.
- [ ] (1.1.0) `Xoay ⟳` 90° → trang PDF chuyển sang khổ ngang; `Chụp lại` thay đúng trang đó; `Huỷ` sau `Chụp lại` giữ ảnh cũ.
- [ ] (1.1.0) Khổ `A4` + lề `Vừa` + căn `Trên`/`Dưới`/`Lấp đầy` → PDF hiển thị đúng vị trí; `Theo ảnh` cho trang bằng kích thước ảnh.
- [ ] (1.1.0) Nhấn giữ thumbnail, `Sửa` hoặc `Xoá` rồi kéo → sắp xếp lại được (không mở màn chỉnh).
- [ ] (1.1.0) `Huỷ`/`Xong` của màn Chỉnh trang không bị thanh trạng thái che, bấm được.

> Ghi chú phát triển: khi đang ở màn review scan, lưu file mã nguồn (Fast Refresh) sẽ unmount màn hình và xoá ảnh trang tạm — hãy scan lại sau mỗi lần hot reload.
- [ ] (1.2.0) Android: trong Zalo chọn một file PDF → `Chia sẻ` → `App khác` → `iScanner` → màn `Nhận file` hiện đúng tên + số trang → `Lưu vào thư viện` tạo tài liệu đúng tên.
- [ ] (1.2.0) Android: chia sẻ 2+ PDF → màn Gộp PDF điền sẵn; chia sẻ ảnh → màn review scan; vừa PDF vừa ảnh → gộp PDF xong tự chuyển sang scan ảnh.
- [ ] (1.2.0) Android: chia sẻ khi iScanner đang tắt hẳn và khi đang mở; chia sẻ file thứ hai khi màn `Nhận file` đang mở → chuyển sang file mới.
- [ ] (1.2.0) Android: mở một PDF trong app Files → `Mở bằng` → `iScanner`.
- [ ] (1.2.0) iPhone: mở PDF/ảnh trong Zalo/Files/Mail → nút chia sẻ → `iScanner` (hoặc `Sao chép vào iScanner`) → app mở màn `Nhận file`.
