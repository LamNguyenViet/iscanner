# Research: Nhận file chia sẻ (share intent / "Mở bằng") cho iScanner

- Ngày: 2026-10-06
- Phạm vi: research spike, không sửa code app.
- Bối cảnh repo: Expo SDK 57 (`expo ~57.0.26`), RN 0.86.3 (New Architecture), `expo-router ~57.0.24`, package/bundle id `com.dlbk.iscanner`, scheme `iscanner` (`app.json`, `package.json`). Android build local bằng Gradle; iOS build IPA unsigned trên GitHub Actions (`.github/workflows/ios-unsigned-ipa.yml`, chạy `expo prebuild --clean` rồi `xcodebuild CODE_SIGNING_ALLOWED=NO`), cài bằng Sideloadly với Apple ID miễn phí.

Ký hiệu nguồn: `[A1]`, `[I3]`... tham chiếu tới mục **Nguồn** ở cuối. Đường dẫn `node_modules/...` là mã nguồn đã đọc trực tiếp trong repo (phiên bản đang cài).

---

## TL;DR và khuyến nghị

1. **Android: làm được, rủi ro thấp.** Khai báo intent filter `SEND` / `SEND_MULTIPLE` (`application/pdf`, `image/*`) và `VIEW` (`application/pdf`) trên `MainActivity`. iScanner sẽ hiện trong share sheet của Zalo/Gmail/Drive/Files/Telegram/Messenger/Photos và trong "Mở bằng" cho PDF. **Nên dùng chính `expo-sharing` đã có trong repo** (bản 57.0.22 có API nhận share mới, dạng *experimental*, chỉ bật cho Android), cộng thêm một intent filter `VIEW` cho PDF trong `app.json` và xử lý URL `content://` trong `app/+native-intent.ts`. Không cần thêm dependency. Ước lượng khoảng 2–3 ngày công, gồm cả test trên máy thật.
2. **iOS, cách 1 (nên làm trước): khai báo document types** (`CFBundleDocumentTypes` cho `com.adobe.pdf` và `public.image`, `LSHandlerRank = Alternate`) qua `ios.infoPlist`. Cách này **không cần extension, không cần App Group, không tốn App ID**, nên chạy được với Apple ID miễn phí. File đến app dưới dạng URL `file://`, qua `RCTLinkingManager` vào expo-router, và được chặn ở `+native-intent`. Hạn chế: chỉ có "Mở bằng"/"Sao chép vào iScanner", không có ô app riêng trong share sheet của Photos, và hành vi khi chọn nhiều file chưa được xác minh. Ước lượng 1–1,5 ngày công.
3. **iOS, cách 2: Share Extension** (`expo-sharing` iOS hoặc `expo-share-intent`). Cách này **bắt buộc có App Group**. Bảng capability của Apple ghi App Groups dùng được với tài khoản Apple Developer miễn phí [I1]. Nhưng extension tốn thêm 1 App ID (giới hạn 10 App ID / 7 ngày) [I6][I7], và **chưa có tài liệu nào xác nhận Sideloadly giữ hoặc tự đăng ký App Group** khi ký lại bằng Apple ID miễn phí. AltStore/SideStore được ghi nhận là *đổi tên* app group, làm `containerURL` trả về `nil` [I9, nguồn thứ cấp]. Kết luận: **chỉ làm sau khi có một spike cài thử qua Sideloadly thành công**. Ước lượng 2–4 ngày công, rủi ro cao.
4. **Zalo** (độ tin cậy thấp–trung bình, chỉ có nguồn thứ cấp): trên cả hai nền tảng, Zalo cho phép "Chia sẻ" → "App khác", mở share sheet hệ thống, áp dụng cho ảnh, video và file [Z2][Z3]. Trên iPhone, thao tác "Lưu file" mở share sheet có mục "Lưu vào Tệp" [Z4], tức là dùng `UIActivityViewController` chuẩn. Chưa biết MIME type thực tế Zalo gửi (`application/pdf` hay `application/octet-stream`), cần đo bằng `adb logcat` (xem mục Rủi ro).
5. **UX đề xuất:** thêm route trung gian `app/incoming.tsx` để copy file vào cache, phân loại rồi điều hướng. PDF đi thẳng vào `merge` với danh sách điền sẵn (bỏ qua bước mở picker tự động). Ảnh đi vào `scan` với danh sách điền sẵn, chuẩn hoá qua `normalizePage` (cạnh dài ≤ 1920). Trường hợp có cả PDF và ảnh thì hỏi người dùng muốn làm gì.

---

## 1. Android

### 1.1 Cơ chế hệ thống

- **Khai báo:** `<intent-filter>` gồm `action` `android.intent.action.SEND` hoặc `SEND_MULTIPLE`, `category DEFAULT` và `<data android:mimeType=...>`. Android chính thức hướng dẫn đúng mẫu này [A1].
- **Dữ liệu đến thế nào:** `Intent.getType()` là MIME type. File nằm trong `EXTRA_STREAM`: một `Uri` với `SEND`, một `ArrayList<Uri>` với `SEND_MULTIPLE` [A1][A2]. Từ API 16, dữ liệu có thể đi kèm `ClipData` để dùng được `FLAG_GRANT_READ_URI_PERMISSION`. Bên gửi *vẫn phải* điền `EXTRA_STREAM` để tương thích, và nếu bên gửi không tự đặt `ClipData` thì hệ thống tự copy sang khi `startActivity` [A2]. Như vậy đọc `EXTRA_STREAM` là đủ.
- **Nhiều loại file trong một lần share:** với `SEND_MULTIPLE`, bên gửi nên đặt type cụ thể nhất có thể, nếu không thì lùi về `image/*` hoặc `*/*`. Bên nhận phải tự kiểm tra từng URI bằng `ContentResolver` [A2]. Theo logic khớp MIME của `IntentFilter`, intent type `*/*` khớp với **mọi** filter có ít nhất một mimeType [A3]. Vì vậy khi share lẫn PDF và JPG, iScanner vẫn hiện trong danh sách, và app phải tự lọc từng file.
- **URI là `content://` kèm quyền tạm thời.** Quyền đọc này *tạm thời* và hết hạn khi task stack của app nhận kết thúc [A4], hoặc "until the activity that receives them is finished" [A5]. Vì vậy **phải copy file vào cache của app ngay khi nhận**, không được lưu URI để dùng sau.
- **An toàn dữ liệu:** Android khuyến cáo rõ rằng dữ liệu đến có thể sai MIME type hoặc rất lớn, và phải xử lý dữ liệu nhị phân ngoài UI thread [A1].
- **`ACTION_VIEW` ("Mở bằng"):** Files, Drive và trình tải xuống thường gửi `VIEW` với `data = content://...` và một type. Muốn nhận thì cần filter `VIEW` + `DEFAULT` + `<data android:scheme="content" android:mimeType="application/pdf"/>`. Riêng `VIEW` thì RN `Linking` đã đọc được (xem 1.3).

### 1.2 Khai báo trong Expo: `app.json` hay config plugin

- `android.intentFilters` trong `app.json` được plugin `@expo/config-plugins` render vào **`MainActivity`**, thông qua `getMainActivityOrThrow`. Action được tự thêm tiền tố `android.intent.action.` và category được tự thêm tiền tố `android.intent.category.`. Plugin hỗ trợ mọi thuộc tính của `<data>`, kể cả `mimeType` (`node_modules/@expo/config-plugins/build/android/IntentFilters.js`; kiểu `mimeType?: string` ở `node_modules/@expo/config-types/build/ExpoConfig.d.ts:628`). **Kết luận: `app.json` đủ để khai báo cả `SEND`, `SEND_MULTIPLE` và `VIEW`.** Giới hạn duy nhất là chỉ gắn được vào `MainActivity`. Với iScanner điều này không thành vấn đề, vì expo-router chỉ có một activity.
- Việc *khai báo* filter không phải phần khó. Phần khó là **đọc intent `SEND` từ JS**: RN không chuyển intent này lên JS (mục 1.3), nên vẫn cần native code, qua một thư viện hoặc một local Expo module.
- `launchMode`: manifest hiện tại đã có `android:launchMode="singleTask"` (`android/app/src/main/AndroidManifest.xml:19`, mặc định của Expo prebuild). Với `singleTask`, nếu activity đang là root của task thì hệ thống chuyển intent mới vào `onNewIntent()` thay vì tạo instance mới [A6]. Nhờ vậy, khi share lúc app đang chạy, iScanner nhận intent ở instance hiện có, không bị nhân bản bên trong task của Zalo. `expo-share-intent` còn xử lý thêm trường hợp activity không phải task root bằng cách khởi động lại với `FLAG_ACTIVITY_NEW_TASK` (`ExpoShareIntentModule.kt`, hàm `handleShareIntent`).

### 1.3 JS/expo-router nhận intent thế nào

- **RN `Linking.getInitialURL()` trên Android chỉ trả `intent.data` khi action là `ACTION_VIEW` hoặc `NDEF_DISCOVERED`** (`node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/intent/IntentModule.kt:56-68`). Hệ quả:
  - `SEND` / `SEND_MULTIPLE`: JS **không thấy gì** nếu không có native module.
  - `VIEW content://…pdf`: JS **có thấy** URL `content://...`. expo-router lấy initial URL và các sự kiện `url`, rồi chuyển qua `redirectSystemPath` của `+native-intent` trước khi điều hướng (`node_modules/expo-router/build/link/linking.js:55-127`). Nếu không chặn ở đó, router sẽ cố route tới `content://...` và rơi vào màn not-found.
- `+native-intent.tsx` là file đặc biệt để viết lại URL hệ thống trước khi expo-router xử lý. Hàm `redirectSystemPath({ path, initial })` có thể là async, và tài liệu dặn "Do not crash inside this function!" [E2].
- Đọc file `content://` từ JS: `expo-file-system` 57.0.7 trong repo hỗ trợ scheme `content` ở cả API mới (`FileSystemPath.kt:35`, `unifiedfile/ContentProviderFile.kt`) lẫn API legacy (`legacy/FileSystemLegacyModule.kt:150-153, 314`). Vì vậy với `VIEW` có thể copy sang cache ngay trong JS, không cần native code.

### 1.4 Thư viện cho Android (chi tiết ở mục 3)

- **`expo-sharing` 57.0.22, đã có trong repo.** Plugin có `android.enabled`, `singleShareMimeTypes`, `multipleShareMimeTypes` và kiểm tra MIME bằng regex. Plugin render filter `SEND`/`SEND_MULTIPLE` vào `MainActivity` (`node_modules/expo-sharing/plugin/build/withShareExtension.js`, `android/withAndroidIntentFilters.js`, `android/parseIntentFilters.js`). Mặc định **tắt** (`enabled ?? false`). Cách nó nối vào router:
  - Cold start: listener đổi intent thành `ACTION_VIEW` với `data = iscanner://expo-sharing` và giữ intent gốc trong singleton. Nhờ vậy router mở được URL đó (`SharingReactActivityLifecycleListener.kt`).
  - App đang chạy: `onNewIntent` phát sự kiện "new intent" với URI `iscanner://expo-sharing` (`ShareIntoUtils.kt`, `emitShareIntentReceived`).
  - JS dùng `useIncomingShare()` hoặc `getResolvedSharedPayloadsAsync()`. Bước resolve **copy từng file vào `cacheDir`** và trả về `contentUri` (`file://`), `contentMimeType`, `originalName`, `contentSize` (`dataParsers/ResolvingShareIntentDataParser.kt:56-84`).
  - **Không** xử lý `ACTION_VIEW` (`isShareIntent` chỉ nhận `SEND`/`SEND_MULTIPLE`).
  - Điểm yếu: tên file đích là `File(cacheDir, fileName)`, nên hai file trùng tên (ví dụ `image.jpg`) sẽ ghi đè lên nhau. Lỗi copy chỉ được `printStackTrace()`. File trong cache không tự dọn.
- **`expo-share-intent` 8.0.1 (bên thứ ba).** Plugin `androidIntentFilters` / `androidMultiIntentFilters`, mặc định chỉ `["text/*"]`. Kiểu TS liệt kê `text/*`, `image/*`, `video/*`, `*/*`, nhưng code chỉ copy chuỗi vào `mimeType`. Plugin cũng đặt `launchMode=singleTask` (`plugin/build/android/*.js`, `plugin/build/types.d.ts`). Native module xử lý `SEND`/`SEND_MULTIPLE` và copy `content://` vào `cacheDir`. Với `VIEW`, module chỉ xử lý text, **không xử lý file** (`ExpoShareIntentModule.kt`, hàm `handleShareIntent`).

---

## 2. iOS

### 2.1 Cách 1: Document types ("Mở bằng" / "Sao chép vào iScanner")

- `CFBundleDocumentTypes` khai báo các loại tài liệu app hỗ trợ [I2]. `LSItemContentTypes` là danh sách UTI [I2]. `LSHandlerRank` xác định thứ hạng app trong số các app cùng mở được loại đó [I2]. Nên đặt `Alternate` để iScanner không giành quyền làm trình mở PDF mặc định.
- `UIDocumentInteractionController.presentOpenInMenu` chỉ liệt kê các app đã đăng ký loại tài liệu qua `CFBundleDocumentTypes` [I3]. Mail, Files, Zalo và nhiều app khác dùng cơ chế này hoặc share sheet.
- UTI hệ thống: `com.adobe.pdf` [I4], `public.image` [I4]. Apple dặn: "If your app uses a type that this framework provides, don't redeclare it", nên **không cần `UTImportedTypeDeclarations`** [I5].
- `LSSupportsOpeningDocumentsInPlace` [I2]: nên đặt `false`. Khi đó hệ thống đưa cho app một *bản sao*. Apple ghi rõ: khi `openInPlace` là `false` hoặc không có, app "must copy the document" [I8]. Nếu đặt `true` thì phải dùng security-scoped URL với `startAccessingSecurityScopedResource()` [I8], phức tạp hơn mà không cần thiết.
- Khai báo qua `app.json` → `ios.infoPlist`. Expo mô tả trường này là "Dictionary of arbitrary configuration to add to your standalone app's native Info.plist" và không có validation [E1]. Không cần config plugin.
- **Luồng URL vào JS:** `ExpoAppSceneDelegate` chuyển mọi `URLContexts` qua `SceneEventForwarder.open(url:)`, rồi tới `RCTLinkingManager.application(_:open:options:)`. Lúc cold start, `urlContexts.first` được dùng làm launch URL (`node_modules/expo/ios/AppDelegates/ExpoAppSceneDelegate.swift:58-70, 103-105`; `SceneEventForwarder.swift:21-31`). JS nhận `file:///…` qua `Linking`, rồi tới expo-router và `+native-intent` (như Android `VIEW`).
  - Lưu ý: khi nhiều file đến cùng lúc, **mỗi file là một sự kiện URL riêng**, nên cần gom lại (debounce) trong JS.
- **Ưu điểm lớn:** không có target phụ, không entitlement, không App ID mới, nên hợp hoàn toàn với IPA unsigned + Sideloadly + Apple ID miễn phí.
- **Hạn chế, cần xác minh trên máy (chưa tìm được nguồn Apple nói rõ):**
  - Trong share sheet (`UIActivityViewController`), app chỉ có document type có hiện ở hàng app ("Sao chép vào…") hay không, đặc biệt khi chọn **nhiều** file.
  - App Ảnh (Photos) gần như chắc chắn không liệt kê kiểu app này, vì Photos chia sẻ asset ảnh chứ không phải file. Muốn nhận ảnh từ Photos thì cần Share Extension.

### 2.2 Cách 2: Share Extension

- Extension là target riêng. **Theo kiến trúc của Apple**, extension không giao tiếp trực tiếp với app chứa nó: "A Today widget (and no other app extension type) can ask the system to open its containing app" [I10]. Dữ liệu chỉ chia sẻ được qua *shared container* sau khi bật **App Groups** cho cả app lẫn extension [I11].
- Cả `expo-sharing` (iOS) và `expo-share-intent` đều mở app chính bằng cách duyệt responder chain tìm `UIApplication` rồi gọi `open(url)`:
  - `expo-sharing`: `plugin/template-files/ios/ShareIntoViewController.swift:266-277`.
  - `expo-share-intent`: `plugin/build/ios/ShareExtensionViewController.swift:492-510`.
  - Chính tài liệu Expo cảnh báo cách này "is not officially supported by Apple and may stop working in a future iOS release" [E3].
- `expo-sharing` iOS: target `expo-sharing-extension`, deployment target 16.4. `appGroupId` mặc định là `group.<bundleId>`, và plugin cảnh báo phải tự đăng ký App Group nếu không build bằng EAS. `activationRule` mặc định chỉ gồm text + 1 URL, nên với PDF/ảnh phải đặt `supportsFileWithMaxCount` / `supportsImageWithMaxCount` (`plugin/build/withShareExtension.js`, `sharingPlugin.types.d.ts`). Extension copy file vào container của App Group (`ShareIntoViewController.swift:204-215`).
- `expo-share-intent` iOS: target `ShareExtension`, bundle id `<bundleId>.share-extension`, app group `group.<bundleId>` (`plugin/build/ios/constants.js`). `iosActivationRules` mặc định chỉ có web URL/page (README). Swift template dùng `containerURL(...)!` (force unwrap ở `ShareExtensionViewController.swift:300, 385, 456`), nên **extension sẽ crash nếu App Group không khả dụng**.

### 2.3 Kết luận với Apple ID miễn phí (personal team)

| Điều kiện | Bằng chứng | Đánh giá |
|---|---|---|
| App Groups có dùng được với tài khoản miễn phí không | Bảng "Supported capabilities (iOS)" của Apple, cột "Apple Developer" (miễn phí): **App groups ✓**. Để so sánh: Push notifications ✗, Associated domains ✗, Sign in with Apple ✗ [I1] (đọc trực tiếp HTML, ngày 2026-10-06) | Về mặt Apple: **có** |
| Số App ID | Personal team: tối đa 10 App ID, hết hạn sau 7 ngày; tối đa 3 app trên mỗi thiết bị; profile hết hạn sau 7 ngày [I6]. AltStore: số App ID mỗi app cần "depends on the number of app extensions" [I7]. Sideloadly: "You may create up to 10 App IDs every 7 days" [S1] | Extension làm số App ID tiêu thụ **tăng gấp đôi** (2 App ID mỗi lần cài nếu bundle id mới) |
| Sideloadly có giữ/đăng ký App Group khi ký bằng Apple ID miễn phí không | Trang chủ Sideloadly: hỗ trợ Apple ID miễn phí, có "Remove Extensions" và "Change Bundle ID" [S2]. Changelog: "custom app entitlements (Apple Developer Program only)" [S3]. **Không có tài liệu nào nói về App Group** | **Chưa xác định**, cần spike |
| Công cụ sideload khác xử lý App Group thế nào | Nhiều PR/issue GitHub (bên thứ ba) ghi nhận AltServer/SideStore *đổi tên* app group (thêm team ID), khiến `containerURL` trả `nil` nếu app hard-code group id [I9] | Nguồn thứ cấp, độ tin cậy trung bình. Cả hai thư viện đều hard-code group id trong Info.plist, nên **rủi ro cao** |

**Verdict:**
- Document types (cách 1): **chạy được** với Apple ID miễn phí, không phụ thuộc Sideloadly.
- Share Extension (cách 2): về lý thuyết Apple cho phép App Groups với tài khoản miễn phí, nhưng **phụ thuộc vào cách Sideloadly ký lại entitlements, điều chưa có tài liệu**.
  - Nếu Sideloadly giữ nguyên `group.com.dlbk.iscanner` và tự đăng ký group cho team thì chạy được.
  - Nếu Sideloadly đổi tên group hoặc bỏ entitlement thì extension sẽ crash (`expo-share-intent`) hoặc báo lỗi (`expo-sharing`).
  - Ngoài ra, CI hiện build với `CODE_SIGNING_ALLOWED=NO`, nên file `.entitlements` của cả hai target không được nhúng bằng chữ ký. Sideloadly phải tự sinh entitlements, và đây chính là điểm chưa rõ.
  - **Cần spike 0,5 ngày:** bật `expo-sharing` iOS trên một branch, build IPA, cài bằng Sideloadly, rồi kiểm tra extension có hiện không, `UserDefaults(suiteName:)` / `containerURL` có khác `nil` không, và app chính có đọc được payload không.

---

## 3. So sánh thư viện

Dữ liệu `npm view` và GitHub API lấy ngày 2026-10-06.

| Thư viện | Bản mới nhất (ngày publish) | SDK 57 / New Arch | Android | iOS | expo-router | Ghi chú |
|---|---|---|---|---|---|---|
| **`expo-sharing`** (first-party, đã cài) | 57.0.22 (khớp SDK 57) | Có. Expo Module, đi cùng SDK | `SEND`/`SEND_MULTIPLE` theo MIME tự chọn; copy vào cache khi resolve; **không có `VIEW`** | Share Extension + App Group (tuỳ chọn, mặc định tắt), deployment 16.4 | Chính thức: `+native-intent` bắt hostname `expo-sharing` [E3] | API nhận share đánh dấu **experimental** [E3]; tính năng thêm ở PR expo#42284, sửa lỗi "enabled by default" ở expo#42661 (`CHANGELOG.md:247,270`). Lỗi trùng tên file trong cache |
| **`expo-share-intent`** (achorein) | 8.0.1 (2026-07-10); 8.0.0 (2026-07-03) | peer `expo ^57`; README: SDK 57 cần 8.0+; là Expo Module | `SEND`/`SEND_MULTIPLE`, ép `singleTask`, copy vào cache; **không có `VIEW` cho file** | Share Extension + App Group, force unwrap `containerURL` | Theo README: xử lý ở Layout + `+native-intent` (ví dụ chính thức `example/expo-router`) | Repo active (push 2026-07-10, khoảng 608★, 52 issue mở). Cần dev client, không chạy được trên Expo Go |
| `expo-share-extension` (MaxAst) | 5.0.6 (2026-02-23); 6.0.0-beta | peer `expo *` | Không có (chỉ iOS) | Extension với UI React Native tuỳ biến | n/a | Dùng khi cần UI riêng trong extension; thừa so với nhu cầu của iScanner |
| `react-native-share-menu` (meedan) | 6.0.0 (2022-05-12) | Không có dấu hiệu hỗ trợ New Arch hay Expo plugin | Có | Có, cấu hình thủ công | Không | Repo GitHub trả 404 qua API (ngày 2026-10-06). **Loại** |
| `react-native-receive-sharing-intent` (ajith-ab) | 2.0.0 (2021-05-17) | Không | Có | Có, cấu hình thủ công | Không | Push cuối 2024-07-04, 126 issue mở. **Loại** |

**Chọn:** `expo-sharing`, chỉ bật Android, kèm filter `VIEW` tự khai báo trong `app.json`.
- Lý do: đã có trong dependency, đúng phiên bản SDK, và có tài liệu chính thức về expo-router.
- `expo-share-intent` là phương án dự phòng, chín muồi hơn về iOS. Chỉ cân nhắc nếu sau này làm Share Extension và spike Sideloadly thành công.
- Không dùng song song hai thư viện vì cả hai cùng thêm intent filter `SEND` và cùng tạo extension.
- Phương án C là tự viết local Expo module (`modules/share-intake`, khoảng 150 dòng Kotlin dùng `OnNewIntent` + `ReactActivityLifecycleListener`, đúng cách hai thư viện trên đang làm). Phương án này cho toàn quyền đặt tên file và xử lý `VIEW`, đổi lại phải tự bảo trì thêm native code.

---

## 4. Zalo

| Nhận định | Nguồn | Độ tin cậy |
|---|---|---|
| Trang trợ giúp chính thức của Zalo chỉ mô tả "Lưu về máy", "Tải về" và "Lưu My Documents". **Không** có hướng dẫn chia sẻ sang app khác hay "Mở bằng" | [Z1] (help.zalo.me, first-party) | Cao (về nội dung trang) |
| Ảnh/video trong chat: nhấn giữ → "Chia sẻ" → "App khác" → "Thêm" → chọn app, tức là mở share sheet hệ thống. Áp dụng cho cả iOS và Android | [Z2] thegioididong, 2020 (thứ cấp, cũ) | Trung bình–thấp |
| File (tài liệu) trong chat: biểu tượng chia sẻ → "App khác" → chọn app; "cách làm tương tự trên Android và iPhone" | [Z3] thanhtrungmobile, 2024 (thứ cấp) | Trung bình–thấp |
| iPhone: nhấn giữ file → "Lưu file" → kéo xuống chọn "Lưu vào Tệp". Đây là action của share sheet iOS, nên Zalo iOS dùng `UIActivityViewController` | [Z4] cellphones sforum, 2026-07 (thứ cấp) | Trung bình |
| Android: Zalo mở file đã tải bằng app ngoài (ví dụ Microsoft Office/WPS), tức là dùng implicit intent kiểu `VIEW` | [Z5] mytour (thứ cấp) | Thấp |
| **Chưa biết:** MIME type Zalo đặt cho intent (PDF có thể là `application/pdf` hoặc `application/octet-stream`), authority của `content://`, Zalo có dùng `SEND_MULTIPLE` khi chọn nhiều ảnh không, và dung lượng tối đa | Không có nguồn | Cần đo |

**Cách đo trên Android:** share từ Zalo sang iScanner bản dev, rồi xem `adb logcat -s ActivityTaskManager` (dòng `START u0 {act=… typ=… }`). Ngoài ra nên log `intent.type` và `contentResolver.getType(uri)` trong JS (expo-sharing trả `mimeType` và `contentMimeType`).

**Hệ quả cho thiết kế:**
- Nên có thêm filter `*/*`? **Không**, vì iScanner sẽ hiện cho mọi loại file. Chỉ cân nhắc nếu đo thấy Zalo gửi `application/octet-stream`. Nếu vậy thì thêm riêng `application/octet-stream` cho `SEND` và lọc theo đuôi `.pdf` hoặc magic bytes `%PDF`.
- Với share hỗn hợp, Zalo/hệ thống sẽ gửi `*/*`. Intent này khớp mọi filter có mimeType [A3], nên app luôn phải kiểm tra từng file.

---

## 5. UX đề xuất và điểm tích hợp trong codebase

### 5.1 Hành vi

| Đầu vào | Hành vi |
|---|---|
| 1..n PDF | Mở `merge` với danh sách điền sẵn (bỏ qua picker tự mở). Chỉ có 1 PDF thì vẫn vào `merge`, người dùng có thể thêm file hoặc lưu thẳng vào thư viện. Có thể thêm nút "Lưu vào thư viện" sau |
| 1..n ảnh | Mở `scan` với các trang điền sẵn, đã chuẩn hoá bằng `normalizePage` (cạnh dài ≤ 1920 px, JPEG 0.95; `src/imaging/enhance.ts:15,64`), không mở camera tự động |
| PDF + ảnh lẫn lộn | `Alert` hỏi: "Gộp tất cả thành 1 PDF" (mỗi ảnh thành PDF 1 trang qua `src/pdf/createPdfFromImages.ts`, sau đó vào `merge`) / "Chỉ dùng ảnh" / "Chỉ dùng PDF" / Huỷ |
| File không hỗ trợ / hỏng / có mật khẩu | Bỏ qua, báo bằng `Alert` giống thông báo "Không đọc được file" hiện có (`app/merge.tsx`) |
| Cold start | `+native-intent` trả `/incoming`. Màn này resolve, copy file, rồi `router.replace` sang `merge`/`scan`, để nút Back quay về `index` |
| App đang chạy, đang ở `scan`/`merge` với dữ liệu chưa lưu | `+native-intent` trả `/incoming`. Màn này phát hiện phiên dở dang (có thể dùng một flag trong handoff) và hỏi "Bỏ phiên hiện tại?". Nếu không có phiên dở thì làm như cold start |

### 5.2 Kích thước và vòng đời file

- Kiểm tra `contentSize` trước khi xử lý. Đề xuất ngưỡng mềm 50 MB mỗi PDF và 200 MB tổng, vì `pdf-lib` nạp toàn bộ bytes vào bộ nhớ JS (`src/workflows/mergeWorkflow.ts`, `createMergedDocument`). Với ảnh, giới hạn khoảng 50 ảnh mỗi lần.
- **Copy ngay:** quyền URI trên Android hết hạn khi task hoặc activity kết thúc [A4][A5]. `expo-sharing` đã copy vào `cacheDir` khi resolve. Bước import phải *đổi tên ngay* sang tên duy nhất (UUID) trong thư mục riêng (ví dụ `cache/incoming/`), để tránh lỗi ghi đè khi trùng tên, rồi gọi `clearSharedPayloads()`.
- Với `VIEW content://` (Android) và `file://…` (iOS, bản sao hệ thống đưa): copy bằng `expo-file-system` vào `cache/incoming/`, sau đó xoá bản gốc trong container nếu có (iOS).
- Dọn dẹp: tái dùng `deleteFiles` như `scan`/`merge` đang làm khi người dùng huỷ (`app/merge.tsx:45-50`, `app/scan.tsx:96-102`). Thêm bước quét `cache/incoming/` lúc app khởi động để xoá file mồ côi.

### 5.3 Điểm tích hợp (file cụ thể)

| File | Thay đổi |
|---|---|
| `app.json` | (a) `plugins`: `["expo-sharing", { "android": { "enabled": true, "singleShareMimeTypes": ["application/pdf","image/*"], "multipleShareMimeTypes": ["application/pdf","image/*"] }, "ios": { "enabled": false } }]`. (b) `android.intentFilters`: `[{ "action": "VIEW", "category": ["DEFAULT"], "data": [{ "scheme": "content", "mimeType": "application/pdf" }] }]`. (c) `ios.infoPlist`: `CFBundleDocumentTypes` gồm 2 mục (`com.adobe.pdf` và `public.image`, `CFBundleTypeRole = Viewer`, `LSHandlerRank = Alternate`), `LSSupportsOpeningDocumentsInPlace = false` |
| `app/+native-intent.ts` (mới) | `redirectSystemPath`: URL có host `expo-sharing` trả `/incoming?src=share`; URL bắt đầu bằng `content://` hoặc `file://` thì lưu URL vào handoff rồi trả `/incoming?src=view`; mọi trường hợp khác giữ nguyên `path`. Bọc `try/catch` và trả `/` khi lỗi [E2] |
| `app/incoming.tsx` (mới) + `app/_layout.tsx` | Màn chờ "Đang nhận file…": đọc `getResolvedSharedPayloadsAsync()` hoặc URL từ handoff, gom các sự kiện URL đến gần nhau (debounce khoảng 300 ms cho iOS nhiều file), copy, phân loại, rồi `router.replace`. Thêm `<Stack.Screen name="incoming" />` vào layout |
| `src/workflows/incomingWorkflow.ts` (mới, thuần TS, test được bằng jest) | `classifyIncoming(files) → { pdfs, images, rejected }` theo MIME, đuôi file và magic bytes, cùng các ngưỡng kích thước. Đặt theo đúng pattern `mergeWorkflow.ts`/`scanWorkflow.ts` (inject `readBytes`) |
| `src/workflows/incomingHandoff.ts` (mới) | Kho tạm in-memory dạng `set`/`take`, chỉ lấy một lần, để truyền danh sách file sang `scan`/`merge`. Không truyền qua URL params vì danh sách có thể dài |
| `src/native/importShared.ts` (mới) | Copy `content://` hoặc `file://` vào `cache/incoming/<uuid>.<ext>` bằng `expo-file-system`. Đặt cạnh `pickPdfs.ts`/`readBytes.ts` |
| `app/merge.tsx` | Trong effect auto-start (`started.current`, dòng 87–88): nếu `incomingHandoff.take('pdf')` có dữ liệu thì gọi `loadPickedPdfs({ readBytes }, files)` rồi `append`, thay vì `pick()` |
| `app/scan.tsx` | Trong effect auto-start (dòng 164–165): nếu handoff có ảnh thì `normalizeAll(uris)` (dòng 61) rồi `append`, thay vì `scanDocuments()` |

---

## 6. Ước lượng công sức

| Hạng mục | Công | Ghi chú |
|---|---|---|
| Android: cấu hình `expo-sharing` + `VIEW`, `+native-intent`, `incoming`, handoff, sửa `scan`/`merge`, unit test cho `incomingWorkflow` | 1,5–2 ngày | Không thêm dependency |
| Android: test thực tế với Zalo, Gmail, Drive, Files, Telegram, Messenger, Google Photos (1 file, nhiều file, lẫn lộn; cold/warm) + đo MIME | 0,5–1 ngày | |
| iOS cách 1 (document types): `infoPlist`, xử lý `file://`, debounce nhiều file, build CI + Sideloadly test | 1–1,5 ngày | Dùng chung `incoming` với Android |
| iOS cách 2 spike (Share Extension + App Group qua Sideloadly) | 0,5 ngày | Quyết định go/no-go |
| iOS cách 2 triển khai, nếu spike thành công | 1,5–3 ngày | Activation rules cho PDF/ảnh, kiểm tra App ID budget, CI phải build thêm target extension |

---

## 7. Rủi ro và câu hỏi mở

1. **Sideloadly + App Group (Apple ID miễn phí):** chưa có tài liệu (mục 2.3). Đây là rủi ro chặn cách 2. Đã có kế hoạch giảm thiểu: làm cách 1 trước, rồi spike riêng.
2. **API nhận share của `expo-sharing` đang experimental** [E3], nên có thể đổi API ở SDK 58. Cần ghim phiên bản và thêm unit test quanh adapter (`incomingWorkflow`).
3. **Lỗi trùng tên file trong cache của `expo-sharing` Android** (`ResolvingShareIntentDataParser.kt:65`). Khi share nhiều ảnh cùng tên (ví dụ app nào đó đặt mọi file là `image.jpg`), các bản copy sẽ ghi đè lên nhau. Cần test. Nếu gặp thì chuyển sang local module (phương án C) hoặc `expo-share-intent` (đặt tên `IMG_<timestamp>` khi không có display name, nhưng cũng dùng display name nếu có).
4. **MIME type thực tế của Zalo** chưa biết (mục 4), có thể cần thêm `application/octet-stream`.
5. **iOS, nhiều file qua document types:** chưa xác minh share sheet có hiện iScanner khi chọn nhiều file không, và các URL tới khi cold start có bị mất trước khi JS sẵn sàng không (chỉ `urlContexts.first` được dùng làm launch URL, các URL còn lại là sự kiện; `ExpoAppSceneDelegate.swift:58-70`).
6. **expo-router và URL lạ:** quên chặn `content://` hoặc `file://` trong `+native-intent` sẽ làm app rơi vào màn not-found. Cần test cả cold start và warm start.
7. **Bộ nhớ:** PDF lớn hoặc nhiều ảnh lớn có thể gây OOM vì `pdf-lib` và chuẩn hoá ảnh đều chạy toàn bộ trong bộ nhớ, nên cần áp ngưỡng ở mục 5.2.
8. **Hiện diện ngoài ý muốn:** filter `image/*` cho `SEND` khiến iScanner hiện ở *mọi* lần chia sẻ ảnh. Điều này chấp nhận được với app scan. Không thêm `VIEW image/*` để tránh làm phiền trình xem ảnh mặc định.
9. **CI iOS:** khi bật cách 2, `xcodebuild` sẽ build thêm target extension. Bước "Package .ipa" hiện copy cả thư mục `.app`, nên `PlugIns/` sẽ đi kèm. Cần kiểm tra lại.

---

## Nguồn

**Android**
- [A1] Android Developers, "Receive simple data from other apps": https://developer.android.com/training/sharing/receive
- [A2] AOSP `Intent.java`, javadoc của `ACTION_SEND` / `ACTION_SEND_MULTIPLE` (EXTRA_STREAM, ClipData, mixed types): https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/content/Intent.java
- [A3] AOSP `IntentFilter.java`, `findMimeType` ("Deal with an Intent wanting to match every type in the IntentFilter"): https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/content/IntentFilter.java
- [A4] Android Developers, "Sharing a file" ("permissions… expire automatically when the receiving app's task stack is finished"): https://developer.android.com/training/secure-file-sharing/share-file
- [A5] Android Developers, "Content provider basics", mục temporary URI permissions: https://developer.android.com/guide/topics/providers/content-provider-basics
- [A6] Android Developers, `<activity>`, `launchMode="singleTask"`: https://developer.android.com/guide/topics/manifest/activity-element

**Expo / React Native** (cùng mã nguồn đã đọc trong `node_modules`)
- [E1] Expo app config (`android.intentFilters`, `ios.infoPlist`, `ios.entitlements`): https://docs.expo.dev/versions/latest/config/app/
- [E2] Expo Router, `+native-intent`: https://docs.expo.dev/router/advanced/native-intent/
- [E3] Expo Sharing, receiving shared data (experimental, plugin config, expo-router): https://docs.expo.dev/versions/latest/sdk/sharing/
- `node_modules/@expo/config-plugins/build/android/IntentFilters.js`; `node_modules/@expo/config-types/build/ExpoConfig.d.ts`
- `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/intent/IntentModule.kt`
- `node_modules/expo-router/build/link/linking.js`
- `node_modules/expo/ios/AppDelegates/ExpoAppSceneDelegate.swift`, `SceneEventForwarder.swift`
- `node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/…` (hỗ trợ `content://`)
- `node_modules/expo-sharing/` 57.0.22: `plugin/build/withShareExtension.js`, `plugin/build/android/*`, `plugin/build/ios/withAppGroupId.js`, `plugin/template-files/ios/ShareIntoViewController.swift`, `android/src/main/java/expo/modules/sharing/*`, `build/Sharing.d.ts`, `CHANGELOG.md`
- `expo-share-intent` 8.0.1 (tarball `npm pack`): `plugin/build/**`, `android/.../ExpoShareIntentModule.kt`, `build/utils.js`, `README.md`; repo https://github.com/achorein/expo-share-intent; ví dụ expo-router: https://github.com/achorein/expo-share-intent/tree/main/example/expo-router/app
- npm registry (`npm view <pkg> version time`), ngày 2026-10-06: `expo-share-intent`, `expo-share-extension` (https://github.com/MaxAst/expo-share-extension), `react-native-share-menu` (https://github.com/meedan/react-native-share-menu), `react-native-receive-sharing-intent` (https://github.com/ajith-ab/react-native-receive-sharing-intent)

**Apple / sideload**
- [I1] Apple, "Supported capabilities (iOS)" (cột ADP / ADEP / Apple Developer): https://developer.apple.com/help/account/reference/supported-capabilities-ios
- [I2] Apple, `CFBundleDocumentTypes`, `LSItemContentTypes`, `LSHandlerRank`, `LSSupportsOpeningDocumentsInPlace`: https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundledocumenttypes ; https://developer.apple.com/documentation/bundleresources/information-property-list/lssupportsopeningdocumentsinplace
- [I3] Apple, `UIDocumentInteractionController.presentOpenInMenu(from:in:animated:)`: https://developer.apple.com/documentation/uikit/uidocumentinteractioncontroller/presentopeninmenu(from:in:animated:)
- [I4] Apple, `UTType.pdf` (`com.adobe.pdf`), `UTType.image` (`public.image`): https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct/pdf ; https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct/image
- [I5] Apple, "Defining file and data types for your app": https://developer.apple.com/documentation/uniformtypeidentifiers/defining-file-and-data-types-for-your-app
- [I6] Apple, "Compare memberships" (giới hạn personal team: 10 App ID / 7 ngày, 3 app mỗi thiết bị, profile 7 ngày): https://developer.apple.com/support/compare-memberships/
- [I7] AltStore docs, "App IDs": https://faq.altstore.io/altstore-classic/app-ids
- [I8] Apple, `UIApplication.OpenURLOptionsKey.openInPlace`, `UIScene.OpenURLOptions.openInPlace`, `startAccessingSecurityScopedResource()`: https://developer.apple.com/documentation/uikit/uiapplication/openurloptionskey/openinplace ; https://developer.apple.com/documentation/uikit/uiscene/openurloptions/openinplace ; https://developer.apple.com/documentation/foundation/nsurl/startaccessingsecurityscopedresource()
- [I9] Nguồn thứ cấp (PR/issue GitHub của dự án bên thứ ba) về việc AltServer/SideStore đổi tên App Group: https://github.com/nadolc/IncomeMeter/pull/8 ; https://github.com/kinoko34077/gesture-ime/issues/142 ; https://github.com/lilfeelz/keyboard/pull/12
- [I10] Apple, App Extension Programming Guide, "Understand How an App Extension Works": https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionOverview.html
- [I11] Apple, App Extension Programming Guide, "Sharing Data with Your Containing App": https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html
- [S1] Sideloadly FAQ: https://sideloadly.io/faq.html
- [S2] Sideloadly, trang chủ: https://sideloadly.io/index.html
- [S3] Sideloadly, changelog: https://sideloadly.io/changelog.html

**Zalo**
- [Z1] Zalo Help (first-party), "Lưu về máy hoặc lưu My Documents…": https://help.zalo.me/huong-dan/chuyen-muc/nhan-tin-va-goi/nhan-tin/tai-ve-may-luu-my-documents-cac-anh-video-file-quan-trong-tren-zalo/
- [Z2] (thứ cấp) Thegioididong, 19/09/2020: https://www.thegioididong.com/game-app/cach-chia-se-tin-nhan-anh-video-tu-zalo-qua-facebook-1291507
- [Z3] (thứ cấp) Thành Trung Mobile, 23/10/2024: https://thanhtrungmobile.vn/cach-chuyen-file-tu-zalo-sang-messenger-p27407.html
- [Z4] (thứ cấp) CellphoneS Sforum, 2026-07: https://cellphones.com.vn/sforum/tim-file-tai-ve-tu-zalo-luu-o-dau
- [Z5] (thứ cấp) Mytour: https://mytour.vn/vi/blog/bai-viet/kham-pha-cach-mo-tep-tren-zalo-dien-thoai-mot-cach-doc-dao.html

**Codebase iScanner:** `app.json`, `package.json`, `android/app/src/main/AndroidManifest.xml`, `.github/workflows/ios-unsigned-ipa.yml`, `app/_layout.tsx`, `app/scan.tsx`, `app/merge.tsx`, `src/native/pickPdfs.ts`, `src/workflows/mergeWorkflow.ts`, `src/imaging/enhance.ts`.
