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
- (1.3.0) **Giao diện Sáng / Tối / Theo hệ thống**: nút ⚙︎ trên màn Thư viện. `Theo hệ thống` (mặc định) đổi theo cài đặt của máy ngay cả khi app đang mở; lựa chọn được lưu lại. Màn Chỉnh trang luôn nền tối, ảnh và trang PDF giữ nguyên màu.
- (1.4.0) **Đa ngôn ngữ Tiếng Việt / English**: mặc định theo ngôn ngữ máy (máy tiếng Việt → Tiếng Việt, còn lại → English); đổi trong ⚙︎ **Cài đặt** (cùng chỗ chọn giao diện) hoặc trong cài đặt ngôn ngữ riêng cho từng app của Android 13+ / iOS. Lựa chọn được lưu lại.
- (1.5.0) **Thông báo lỗi rõ ràng**: mỗi loại lỗi có lớp riêng (`PdfLoadError`, `PdfEncryptedError`, `FileTooLargeError`…) và popup theo ngôn ngữ đang dùng, nói rõ chuyện gì xảy ra và nên làm gì, kèm `Mã lỗi: …` ở cuối. Nhiều file lỗi cùng lúc → một popup liệt kê từng file và lý do.
- (1.6.0) **Log hệ thống**: lỗi, cảnh báo và các sự kiện chính được ghi vào file riêng theo ngày (`logs/YYYY-MM-DD.log`, JSON Lines, trong thư mục riêng của app), tự xoá sau 7 ngày, không bao giờ ghi dữ liệu file/ảnh (byte, base64, data URI). ⚙︎ Cài đặt → `Hỗ trợ` → `Gửi log lỗi` để gửi log khi báo lỗi.
- (1.7.0) **Bắt buộc cập nhật (force update)**: app đọc cấu hình phiên bản từ một GitHub Gist công khai (`extra.updateConfigUrl` trong `app.json`). Dưới `minBuild` → màn chặn toàn app (Android: tự tải APK, kiểm MD5, mở trình cài đặt; iOS: mở trang hướng dẫn); dưới `latestBuild` → nhắc cập nhật, có `Để sau` (24 giờ). Mất mạng không bao giờ chặn người chưa bị yêu cầu cập nhật. ⚙︎ Cài đặt → `Hỗ trợ` hiện phiên bản và `Kiểm tra cập nhật`.

- (1.10.0) **Gộp PDF có mật khẩu**: khi chọn hoặc nhận một PDF được bảo vệ bằng mật khẩu, app hỏi mật khẩu từng file (`Nhập mật khẩu` → `Mở` / `Bỏ qua file này`); sai mật khẩu thì báo ngay trong hộp thoại và cho nhập lại; bỏ qua thì file không được thêm, không có popup lỗi. Chấp nhận cả mật khẩu mở lẫn mật khẩu chủ (owner); PDF chỉ khoá quyền (không có mật khẩu mở) được mở thẳng không hỏi. Giải mã ngay trên máy (RC4 và AES); file gộp và bản lưu vào thư viện luôn **không** có mật khẩu. Mật khẩu chỉ nằm trong bộ nhớ khi đang thao tác, không bao giờ được lưu hay ghi log.
- (1.11.0) **Word → PDF**: chuyển file Word (`.docx`, `.doc`) sang PDF ngay trên máy, không tải lên đâu cả. Có ở 3 chỗ: nút `Word → PDF` ở Thư viện (chọn nhiều file, mỗi file thành một tài liệu), màn Gộp PDF (chọn lẫn PDF và Word) và khi nhận file chia sẻ từ Zalo/app khác. File Word có mật khẩu hiện hộp `Nhập mật khẩu` như PDF. **Giới hạn**: giữ cấu trúc (tiêu đề, đậm/nghiêng, danh sách, bảng, ảnh) nhưng không giữ bố cục trang gốc (header/footer, text box, cột, ngắt trang, font, kích thước ảnh); `.doc` (Word 97–2003) chỉ lấy chữ.

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

## Phát hành bản mới / Force update

### 1. Tạo khoá ký release (làm một lần)

Khoá debug của template Expo là công khai — ai cũng ký được APK giả bằng nó. Trước khi phát hành, tạo khoá riêng **ngoài repo**:

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore D:/keys/iscanner-release.jks -alias iscanner -keyalg RSA -keysize 2048 -validity 10000
```

Thêm vào `~/.gradle/gradle.properties` (Windows: `C:\Users\<bạn>\.gradle\gradle.properties`) — **đường dẫn keystore phải là đường dẫn tuyệt đối**:

```properties
ISCANNER_UPLOAD_STORE_FILE=D:/keys/iscanner-release.jks
ISCANNER_UPLOAD_STORE_PASSWORD=<mật khẩu keystore>
ISCANNER_UPLOAD_KEY_ALIAS=iscanner
ISCANNER_UPLOAD_KEY_PASSWORD=<mật khẩu khoá>
```

- **Sao lưu** file `.jks` và mật khẩu ở nơi an toàn (ổ khác / trình quản lý mật khẩu). Mất khoá = không bao giờ cập nhật được các máy đã cài nữa.
- Không có các biến trên, build release vẫn chạy nhưng ký bằng khoá debug và Gradle in cảnh báo `iScanner: release build is signed with the DEBUG key` — **đừng phát hành bản đó**.
- Máy đang cài bản ký bằng khoá debug (≤ 1.6.0) phải **gỡ app một lần** rồi cài bản ký khoá release đầu tiên; từ đó về sau cập nhật đè được.
- Plugin `plugins/withReleaseSigning.js` tự cấu hình `signingConfigs.release` khi chạy `npx expo prebuild`.

### 2. Cấu hình phiên bản (Gist)

Tạo một Gist **công khai** chứa `iscanner-version.json`, rồi đặt link *raw* (bỏ phần mã commit để luôn trỏ bản mới nhất) vào `app.json` → `expo.extra.updateConfigUrl`. Để trống = app không kiểm tra cập nhật.

```json
{
  "android": { "minBuild": 7, "latestBuild": 8, "url": "https://…/iScanner-1.7.1-arm64.apk", "md5": "<32 ký tự hex>", "size": 88000000 },
  "ios":     { "minBuild": 7, "latestBuild": 8, "url": "https://…/huong-dan-cap-nhat-ios" },
  "message": { "vi": "…", "en": "…" }
}
```

- So sánh theo **số build**: Android `versionCode`, iOS `buildNumber`.
- `url` bắt buộc `https`; Android bắt buộc `md5`. Cấu hình sai → app coi như không có cập nhật (không chặn).

### 3. Quy trình mỗi lần phát hành

1. Tăng `version`, `android.versionCode`, `ios.buildNumber` trong `app.json`.
2. `npx expo prebuild --clean --platform android` (khi có thay đổi native).
3. Build APK đã ký, chỉ arm64 cho nhẹ: `cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a` (bỏ `-P…` nếu cần cả bản cho máy ảo x86_64).
4. Lấy MD5: `certutil -hashfile android/app/build/outputs/apk/release/app-release.apk MD5` (Windows) hoặc `md5sum …`.
5. Đưa APK lên một địa chỉ `https` công khai.
6. Sửa Gist: `latestBuild`, `url`, `md5`, `size`; tăng `minBuild` nếu muốn **bắt buộc** cập nhật.
7. iOS: build IPA như mục *Cài lên iPhone thật* ở trên, rồi cập nhật `ios.latestBuild` / `ios.minBuild` và trang hướng dẫn.

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
- [ ] (1.2.0) Android: mở lại iScanner từ Đa nhiệm sau khi đã chia sẻ — không bị nhận lại file cũ.
- [ ] (1.3.0) ⚙︎ trên màn Thư viện → menu `Giao diện` có `✓` ở lựa chọn hiện tại (mặc định `Theo hệ thống`).
- [ ] (1.3.0) Chọn `Tối` → mọi màn (Thư viện, Scan, Gộp PDF, Nhận file, Tài liệu), thanh tiêu đề, thanh trạng thái, hộp thoại Xoá, menu nhấn giữ và bàn phím khi đổi tên đều tối; chọn `Sáng` → trở lại sáng.
- [ ] (1.3.0) `Theo hệ thống`: đổi chế độ tối trong Cài đặt máy khi app đang mở → app đổi theo ngay.
- [ ] (1.3.0) Tắt hẳn rồi mở lại app → vẫn giữ lựa chọn giao diện.
- [ ] (1.3.0) iPhone: ba lựa chọn giao diện hoạt động; action sheet và Alert theo giao diện đã chọn.
- [ ] (1.4.0) ⚙︎ → `Cài đặt` có hai nhóm `Giao diện` và `Ngôn ngữ`, dấu `✓` ở lựa chọn hiện tại.
- [ ] (1.4.0) Chọn `English` → mọi màn (Thư viện, Scan, Gộp PDF, Nhận file, Tài liệu, Chỉnh trang), menu, hộp thoại đổi sang tiếng Anh ngay; `Tiếng Việt` → trở lại.
- [ ] (1.4.0) `Theo hệ thống`: đổi ngôn ngữ máy (hoặc ngôn ngữ riêng của iScanner trong Cài đặt Android 13+) khi app đang mở → app đổi theo, không mất trang scan đang làm.
- [ ] (1.4.0) Tắt hẳn rồi mở lại app → giữ ngôn ngữ đã chọn; chia sẻ file vào app khi đang tắt → màn `Nhận file` mở đúng ngôn ngữ đã chọn.
- [ ] (1.4.0) iPhone: câu xin quyền camera hiện đúng ngôn ngữ; iScanner có mục Ngôn ngữ riêng trong Cài đặt iOS.
- [ ] (1.5.0) Gộp 1 file PDF hỏng → popup `Không load được file` / "Không load được file, vui lòng kiểm tra lại định dạng file PDF." kèm tên file và `Mã lỗi: PDF_LOAD` (English: "Cannot load file, check your document's format file PDF.").
- [ ] (1.5.0) Gộp 2 PDF hỏng + 1 PDF tốt → file tốt vẫn vào danh sách; một popup liệt kê 2 file lỗi kèm lý do.
- [ ] (1.5.0) Chia sẻ vào iScanner một file không hỗ trợ (.txt/.zip) hoặc > 100 MB → một popup duy nhất nêu tên file và lý do, rồi về Thư viện.
- [ ] (1.5.0) Từ chối quyền camera rồi bấm Scan → popup `Cần quyền camera` có nút `Mở Cài đặt`; máy không có Google Play → popup `Không thể scan tài liệu` giải thích cần Google Play services.
- [ ] (1.6.0) Gây một lỗi (ví dụ gộp PDF hỏng) → ⚙︎ Cài đặt → `Gửi log lỗi` → bảng chia sẻ mở với `iScanner-logs-<ngày>.txt`; mở file: có dòng `app.start` và dòng `error` mã `PDF_LOAD` kèm tên file, không có chuỗi base64 dài hay `data:image`.
- [ ] (1.6.0) Chưa có log (cài mới, chưa mở app lần nào trước đó) → `Gửi log lỗi` báo `Chưa có log nào.`
- [ ] (1.6.0) Sau 7 ngày, file log cũ tự bị xoá khi mở app (kiểm bằng bản debug: `adb shell run-as com.dlbk.iscanner ls files/logs`).
- [ ] (1.7.0) ⚙︎ Cài đặt → `Hỗ trợ` hiện `Phiên bản 1.7.0 (7)`; `Kiểm tra cập nhật` khi chưa cấu hình Gist → báo không kiểm tra được.
- [ ] (1.7.0) Gist `minBuild` > build hiện tại → màn `Cần cập nhật iScanner` chặn toàn app (nút Back không thoát, TalkBack không chạm được nội dung bên dưới); Android: `Cập nhật` → tải, kiểm MD5, mở trình cài đặt → sau khi cài app mở lên đúng build mới.
- [ ] (1.7.0) Gist `latestBuild` > build hiện tại (nhưng ≥ `minBuild`) → popup `Đã có phiên bản mới`; `Để sau` không nhắc lại trong 24 giờ; đang tải bản không bắt buộc vẫn dùng app được, có nút `Huỷ`.
- [ ] (1.7.0) Đã bị chặn rồi tắt mạng, mở lại app → vẫn bị chặn; mất mạng khi chưa từng bị chặn → app chạy bình thường.
- [ ] (1.7.0) iPhone: bị chặn → `Cập nhật` mở trang hướng dẫn cài lại bằng Sideloadly.
- [ ] (1.10.0) Gộp PDF → chọn một PDF có mật khẩu → hộp `Nhập mật khẩu` hiện đúng tên file, nút `Mở` mờ khi ô trống; nhập sai → dòng đỏ `Mật khẩu không đúng, vui lòng thử lại.`; nhập đúng → file vào danh sách với đúng số trang.
- [ ] (1.10.0) Chọn 3 file: PDF mật khẩu RC4, PDF mật khẩu AES (nhập mật khẩu chủ), PDF chỉ khoá quyền (không hỏi) → `Gộp PDF` → tài liệu mở được, đủ nội dung các trang.
- [ ] (1.10.0) `Bỏ qua file này` hoặc nút Back trong hộp mật khẩu → file không được thêm, không có popup lỗi, các file khác vẫn được xử lý.
- [ ] (1.10.0) Chia sẻ một PDF có mật khẩu vào iScanner → hỏi mật khẩu → `Lưu vào thư viện` → tài liệu mở trong app không cần mật khẩu; `Gộp với file khác` → màn Gộp PDF không hỏi lại.
- [ ] (1.10.0) iPhone: nhập sai mật khẩu rồi nhập lại, và bỏ qua file cuối cùng khi có file lỗi → hộp thoại/popup kế tiếp luôn hiện ra (không bị treo vòng xoay).
- [ ] (1.11.0) Thư viện có 3 nút `Scan` · `Gộp PDF` · `Word → PDF`; bấm `Word → PDF` → picker chỉ cho chọn file Word; chọn 1 file `.docx` → mở luôn tài liệu PDF đúng tên file (bỏ đuôi), có tiêu đề/bảng/ảnh.
- [ ] (1.11.0) `Word → PDF` với file `.docx` có mật khẩu → hộp `Nhập mật khẩu` đúng tên file; sai → dòng đỏ; đúng → tài liệu mở được; trong lúc chuyển có vòng xoay và các nút bị khoá.
- [ ] (1.11.0) File `.docx` mã hoá kiểu cũ (Standard, tạo bằng Office đời cũ) → hiện hộp `Nhập mật khẩu`; nhập đúng → chuyển được sang PDF.
- [ ] (1.11.0) File `.doc` có mật khẩu → hiện hộp `Nhập mật khẩu`; nhập đúng → chuyển được sang PDF.
- [ ] (1.11.0) Gộp PDF → chọn lẫn PDF + `.docx` + `.doc` → danh sách đủ các dòng với số trang → `Gộp PDF` ra một tài liệu đủ nội dung.
- [ ] (1.11.0) Chia sẻ một file `.docx` từ Files/Zalo vào iScanner → màn `Nhận file` hiện số trang → `Lưu vào thư viện` hoặc `Gộp với file khác`.
- [ ] (1.11.0) iPhone: mở `.docx` trong Files → `Chia sẻ` → `iScanner` (bản build IPA chứa module native `office-crypto`).
