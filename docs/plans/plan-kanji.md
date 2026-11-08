# Plan — Phần học Kanji

> **Ngày lập:** 06/11/2026. **Cập nhật:** 08/11/2026. **Người lập:** [CC].
> **Trạng thái:** MVP đã triển khai (commit `bf68798`) — phạm vi thực tế chốt theo **2.136 chữ Jōyō** (`Unihan kJoyoKanji = 2010`), phân cấp theo dải `rank` (N5: 1–120 · N4: 121–320 · N3: 321–720 · N2: 721–1200 · N1: 1201–2136), Hán Việt phủ 2.129/2.136 chữ; nghĩa tiếng Việt của từ vựng liên quan lấy từ `vocabulary`/`flashcards` có sẵn trước rồi mới dịch lười bằng AI.
>
> Mỗi trường và nguồn dữ liệu dưới đây đều đã được **kiểm chứng bằng cách tải
> thật** và đo phủ sóng. Số liệu ghi kèm ở §2 là kết quả đo ban đầu trên 2.211 kanji JLPT N5–N1.

## 1. Yêu cầu

Kanji cần: **chữ**, **cách viết (thứ tự nét)**, **âm Hán Việt**, **onyomi**,
**kunyomi**, **liên tưởng**, **vài từ vựng liên quan**; phân loại **N5–N1**;
**search theo âm Hán Việt**.

Quyết định đã chốt (06/11/2026):

1. Nguồn dữ liệu: **nguồn mở**, không tự viết tay on/kun.
2. Kanji **dùng chung** admin + user; admin sửa được và phân loại lại level.
3. **Cả admin và user** search theo âm Hán Việt.
4. Mỗi kanji là **1 thẻ SRS**.
5. Thứ tự nét: **KanjiVG**, chấp nhận ràng buộc CC BY-SA (§10).
6. Từ vựng liên quan: **JMdict** (term + reading), nghĩa tiếng Việt dịch lười
   bằng AI khi cần (§2.4).
7. Bộ kanji sẽ được **đóng gói thành sản phẩm riêng** → §10 là ràng buộc cứng,
   không phải ghi chú phụ.

## 2. Nguồn dữ liệu — đã kiểm chứng

### 2.1. `kanji.json` — [davidluzgouveia/kanji-data](https://github.com/davidluzgouveia/kanji-data)

Nguồn chính cho chữ, level, on/kun, số nét. MIT, 5,5 MB, tải thẳng từ
`raw.githubusercontent.com`, không cần token.

Đo thực tế: **13.108 chữ**, trong đó **2.211 chữ có `jlpt_new`** —
N5: 79 · N4: 166 · N3: 367 · N2: 367 · N1: 1.232. Đúng phân bố JLPT chuẩn.

Một bản ghi thật:

```json
"学": {
  "strokes": 8, "grade": 1, "freq": 63,
  "jlpt_new": 5,
  "readings_on": ["がく"],
  "readings_kun": ["まな.ぶ"],
  "meanings": ["Study", "Learning", "Science"],
  "wk_radicals": ["Viking", "Child"]
}
```

`kanji-data` lấy thêm 5 trường từ **WaniKani API** (`wk_level`, `wk_meanings`,
`wk_readings_on`, `wk_readings_kun`, `wk_radicals`). **Không dùng 5 trường này.**

Điều khoản WaniKani (Tofugu) cấm rõ: *"You agree not to reproduce, duplicate,
copy, sell, resell or exploit any portion of the Service... without Tofugu's
express written permission."* Nghĩa là dữ liệu WaniKani **không** dùng được cho
sản phẩm thương mại.

Script chỉ đọc 6 trường an toàn: `strokes`, `grade`, `freq`, `jlpt_new`,
`readings_on`, `readings_kun` — tất cả đều gốc KANJIDIC/EDRDG, không phải
WaniKani. Đây là **ràng buộc cứng có test**: unit test của script khẳng định
schema `Kanji` và output script không chứa bất kỳ khoá `wk_*` nào. Lý do đặt
thành test chứ không chỉ ghi chú: một lần ai đó thêm `wk_radicals` vào schema là
dính bản quyền, mà lỗi loại này không gây crash nên sẽ không ai phát hiện.

Ba điểm quyết định chọn nguồn này thay vì KANJIDIC thô:

- **on/kun đã là hiragana**, không phải romaji → bỏ hẳn hạng mục "chuyển romaji
  sang kana" khỏi phạm vi. Kanji có nghĩa là hiển thị được ngay.
- `jlpt_new` **có sẵn** — không phải tự suy level từ `grade` (Unihan `kGradeLevel`
  là cấp giáo dục Nhật, **không** phải JLPT; dùng nhầm sẽ phân loại sai toàn bộ).
- `strokes` (số nét) có sẵn cho mọi chữ.

`readings_kun` có dấu chấm ngăn okurigana (`まな.ぶ`) — quy ước chuẩn từ điển,
cần **tách thành `まな` + okurigana `ぶ`** khi hiển thị và khi tra từ vựng. Có cả
mục bắt đầu/kết thúc bằng `-` (`ひと-`, `-り`) nghĩa là trợ từ ghép (chỉ dùng làm
tiền tố/hậu tố, không đứng một mình) → script tách riêng, UI hiện ở nhóm "chỉ
dùng ghép". Đã đo: **0/2.211 chữ thiếu cả on lẫn kun**, nghĩa là mọi kanji JLPT
đều có ít nhất một cách đọc.

### 2.2. Âm Hán Việt — ghép 3 nguồn, phủ 96,2%

Không có nguồn mở nào cho Hán Việt đầy đủ. Đã thử và đo từng nguồn:

| Nguồn | Nội dung | Phủ trên 2.211 chữ JLPT |
|---|---|---|
| `apps/ui/lib/han-viet.ts` (đã có trong repo) | 897 chữ curate tay, chất lượng cao | 877 chữ |
| **`hanviet-pinyin-words`** (npm, 276 KB) | 10.540 chữ, map pinyin → âm Hán Việt | 1.213 chữ (thêm) |
| Biến thể phồn thể từ **Unihan** + `kVietnamese` | cầu nối chữ Nhật → chữ phồn thể | 37 chữ (thêm) |
| **Còn thiếu** | | **84 chữ** |

`hanvietData` là phát hiện chính: một bảng `{ "学": {pinyin: [âm Hán Việt]} }`
cho 10.540 chữ Hán. Nhưng nó **key theo chữ giản thể Trung**, nên chữ Nhật dạng
shinjitai (学, 国, 来, 会, 体, 医…) tra trực tiếp **không ra** — 76/897 chữ trong
bảng curate của repo rơi vào trường hợp này. Cầu nối: Unihan
`kTraditionalVariant` (学 → 學 → `học`, 国 → 國 → `quốc`). Đã kiểm chứng chạy
đúng.

Kết quả đo sau khi ghép:

```text
N5: 79/79   (100%)      N2: 360/367 (98,1%)
N4: 166/166 (100%)      N1: 1159/1232 (94,1%)
N3: 363/367 (98,9%)     TỔNG: 2127/2211 (96,2%)
```

84 chữ còn thiếu đều là N1 hiếm (絵 雑 込 戻 圧 捜 党 蔵 齢…) → **admin nhập tay**
qua form có sẵn, không cần chặn phát hành.

Thứ tự ưu tiên khi cùng một chữ có nhiều âm: **curate trong repo** → `hanvietData`
→ phồn thể → `kVietnamese`. Lý do: bảng curate đã được đối chiếu tay và khớp
cách gọi quen thuộc (thủy/hỏa/họa kiểu cũ), trong khi `hanvietData` sinh tự động
có chỗ lệch chuẩn (覚 → `giác` vs curate `giác`; 割 → `cắt` vs `cát`).

> **Bảng curate nằm ở `apps/ui/lib/han-viet.ts` (tầng UI).** Script nạp chạy ở
> `apps/api` phải đọc được cùng dữ liệu. Cách xử lý: tách phần `RAW` thành
> `packages/shared/han-viet.json` (thêm `packages/*` vào `pnpm-workspace.yaml`,
> hiện chỉ có `apps/*`); `apps/ui/lib/han-viet.ts` import JSON, **giữ nguyên API
> `hanViet()`** đang dùng cho flashcard, và script nạp cùng đọc một file. Một
> nguồn, hai nơi dùng — không có bảng thứ hai để lệch.

### 2.3. Cách viết (thứ tự nét) — **KanjiVG**

Đây là quyết định quan trọng nhất và đã đo xong.

| Phương án | Phủ JLPT | Dung lượng | Giấy phép | Kết luận |
|---|---|---|---|---|
| **KanjiVG** `kanjivg-20260714-main.zip` | **2211/2211 (100%)** | **1,9 MB path data** | CC BY-SA 3.0 | ✅ **Chọn** |
| `@k1low/hanzi-writer-data-jp` | 2211/2211 (100%) — 6.688 chữ, đủ shinjitai | 9,3 MB nén | LGPL-3 / Arphic PL | ❌ Đúng bộ chữ nhưng LGPL + nặng gấp 10 |
| `hanzi-writer-data` (bản gốc) | thiếu toàn bộ shinjitai (発駅転図…) | 13,5 MB | LGPL / Arphic | ❌ Sai bộ chữ (giản thể Trung) |

KanjiVG cho mỗi chữ một SVG với **path riêng từng nét**, có id đánh số thứ tự và
kèm cả toạ độ đặt số thứ tự nét (`kvg:StrokeNumbers`), khung chuẩn 109×109. Đo
trên 学: 8 nét, 476 byte path. Toàn bộ 2.211 kanji JLPT: **1,9 MB path data**
(trung bình 862 B/chữ, nặng nhất 麟 2.047 B) — nhét thẳng vào Mongo, không cần
package 20 MB, không cần CDN, không thêm dependency nào ở runtime.

Giấy phép CC BY-SA 3.0 — **đã chấp nhận** (quyết định 06/11/2026), nhưng đây là
ràng buộc cứng khi đóng gói bán: xem **§10** để biết chính xác cái gì bán được
độc quyền và cái gì không.

**Cách render:** khung chuẩn 109×109, mỗi nét là 1 `<path d>`; animate bằng
`stroke-dasharray`/`stroke-dashoffset` (Web Animations API, không cần thư viện).
Nét đang vẽ tô đậm, nét đã vẽ giữ màu, nét chưa vẽ mờ. SVG lưu trong document
kanji nên trang chi tiết **không phải gọi mạng** để lấy nét vẽ.

Dữ liệu nét **không** lấy từ `hanzi-writer-data` — bản gốc là bộ chữ giản thể
Trung, thiếu toàn bộ shinjitai Nhật (đã kiểm: 発 駅 転 図 医 đều không có file).
Bản `@k1low/hanzi-writer-data-jp` thì đúng bộ chữ nhưng nặng 20,8 MB và LGPL.
KanjiVG nhẹ hơn 10× và giấy phép CC BY-SA dễ dùng hơn cho nội dung.

### 2.4. Từ vựng liên quan — JMdict

`jmdict-eng-common` (scriptin/jmdict-simplified, CC BY-SA 4.0), 22.650 từ thông
dụng, 16,5 MB JSON.

Đo phủ "kanji có ≥3 từ liên quan":

```text
N5: 79/79 (100%)     N2: 355/367 (96,7%)
N4: 166/166 (100%)   N1: 762/1232 (61,9%)
N3: 366/367 (99,7%)  TỔNG: 1728/2211 (78,2%)
```

N5–N3 gần như tuyệt đối; N1 thấp hơn vì kanji N1 hiếm khi đứng đầu từ thông dụng.

**Đã chốt: JMdict + dịch lười bằng AI.** JMdict chỉ có nghĩa tiếng Anh, không có
bản Việt chính thức (đã tìm: chỉ 2 repo, đều không dùng được). Cách làm:

- Script nạp lưu `term` + `reading` + `glossEn` (Anh) từ JMdict.
- `meaning` tiếng Việt để **trống** khi nạp.
- Khi trang chi tiết kanji được mở mà `words[].meaning` còn trống → gọi AI dịch
  lô 3–5 từ một lần, ghi vào `airesultcache` + cập nhật document.
- Admin cũng có nút "Dịch từ vựng" để dịch trước hàng loạt cho một cấp.

Ưu điểm so với "AI tự sinh từ vựng": từ vựng là **từ thật trong từ điển** (không
bịa), và N5–N3 phủ 99,7–100% nên phần lớn kanji không cần gọi AI lúc học. Chi
phí AI chỉ rơi vào phần dịch nghĩa, không phải phần chọn từ.

Nếu một kanji không có từ nào trong JMdict common (207 chữ N1 như 梧 洸 阿 燿),
`words` để rỗng và UI ẩn khối từ vựng — không gọi AI sinh bù.

### 2.5. Liên tưởng — AI sinh

Không nguồn mở nào có liên tưởng tiếng Việt. Tái dùng `AiExampleService`
(pump + cache + log) với `purpose` mới `"kanji"`. Admin bấm nút sinh → AI trả
`mnemonic` tiếng Việt → admin sửa → publish. Không tự publish.

## 3. Dữ liệu — collection `kanjis`

`apps/api/src/content/schemas/kanji.schema.ts`, đăng ký trong `ContentModule`
(cạnh `Textbook`/`Vocabulary`/`GrammarPoint`). Mongoose tự pluralise →
`kanjis`.

```ts
char: string;            // "学"  — UNIQUE, khoá tự nhiên
level: string;           // "N5".."N1" | "" (chưa phân loại)
hanViet: string;         // "học"
hanVietNorm: string;     // "hoc" — server tính, KHÔNG nhận từ client
onyomi: string[];        // ["がく"]
kunyomi: string[];       // ["まな.ぶ"] giữ dấu chấm như từ điển
strokeCount: number;     // 8
strokes: string[];       // path SVG từng nét, KanjiVG (1,9 MB tổng)
meanings: string[];      // ["học tập", "khoa học"] — VI; "" nếu chưa dịch
meaningsEn: string[];    // ["Study","Learning"] — gốc JMdict/kanji-data
mnemonic: string;        // liên tưởng tiếng Việt (AI + admin duyệt)
words: RelatedWord[];    // 3–5 từ, sub-document inline
radicals: string[];      // bộ thủ, nếu có
source: string;          // "kanji-data+kanjivg" | "admin"
strokeCredit: string;    // "KanjiVG © Ulrich Apel, CC BY-SA 3.0"
status: ContentStatus;   // DRAFT | PUBLISHED — theo đúng P2
lang: "vi";
```

```ts
interface RelatedWord {
  term: string;      // "学生"
  reading: string;   // "がくせい"
  meaning: string;   // "học sinh"  (VI, có thể rỗng → AI điền sau)
  glossEn?: string;  // "student"
  chars: string[];   // ["学","生"] — link sang kanji khác
  level?: string;
}
```

**Index:**

| Index | Loại | Mục đích |
|---|---|---|
| `{ char: 1 }` | **unique** | Một chữ một record; idempotent re-import |
| `{ status: 1, level: 1, char: 1 }` | — | Danh sách public theo cấp |
| `{ status: 1, hanVietNorm: 1 }` | — | **Search Hán Việt**, prefix match |
| `{ status: 1 }` | — | Admin list (mọi status) |

`hanVietNorm`: lowercase + bỏ dấu (ế→e, ị→i, ã→a…). Lý do phải bỏ dấu: người
học gõ "hoc" phải ra 学, gõ "HỌC" cũng phải ra. Bỏ dấu **ở server** khi ghi, nên
client gửi gì cũng đúng. Không dùng text index (tăng dung lượng, không cần cho
1–3 âm mỗi chữ).

**Quyết định phụ:** `level` giữ kiểu `string` tự do như `Textbook.level` (P2
không hard-code bộ level) — N5..N1 chỉ là giá trị phổ biến, admin vẫn gán được
nhóm khác.

## 4. Script nạp — `apps/api/scripts/import-kanji.mjs`

Theo đúng pattern `import-tatoeba.mjs` (script riêng, chạy tay, có `--write`).

```json
"kanji:import": "node scripts/import-kanji.mjs"
```

**Nguồn (cache ở `apps/api/data/kanji/`, tải về lần đầu, `.gitignore`):**

1. `kanji.json` ← raw.githubusercontent (5,5 MB)
2. `kanjivg-*-main.zip` ← GitHub release (12,7 MB) — chỉ đọc entry `kanji/XXXXX.svg`
3. `jmdict-eng-common-*.json` ← GitHub release (16,5 MB)
4. `han-viet.json` ← **từ repo** (`packages/shared/han-viet.json`, 897 chữ)

**Luồng (idempotent, chạy lại không phá dữ liệu):**

```text
1. Đọc kanji.json → 13.108 chữ (chỉ nạp 2.211 chữ có jlpt_new, --all để nạp hết)
2. Đọc KanjiVG zip → map char → string[] path (bỏ qua chữ không có SVG)
3. Đọc han-viet.json (curate) → map char → âm
4. Đọc hanvietData (npm) + Unihan variants → âm dự phòng
   → thứ tự: curate > hanvietData > phồn thể > kVietnamese
5. Đọc JMdict → map char → 3–5 từ thông dụng (lọc: chỉ kanji, ≤6 ký tự,
   ưu tiên từ có nhiều chữ đã học; bỏ biến thể sK/oK/iK/rK)
6. Upsert theo `char`:
   - Ghi đè: level, onyomi, kunyomi, strokeCount, strokes, hanViet,
     hanVietNorm, meaningsEn, words[].term/reading/glossEn/chars, source
   - KHÔNG đụng: mnemonic, meanings (VI), words[].meaning, status
     → chạy lại script không xoá công sức admin
   - status: DRAFT cho record mới
7. In báo cáo: tổng, số có Hán Việt, số có nét vẽ, số có từ, top 30 chữ thiếu HV
```

`--write` mới ghi DB (mặc định in dry-run, như `import-tatoeba`). `--level N5`
để nạp từng cấp. `--all` để nạp cả 13.108 chữ (mặc định chỉ 2.211 JLPT).

**Ước lượng thời gian:** tải ~35 MB, xử lý <10s, upsert 2.211 doc <5s.

## 5. API

### 5.1. Public (`@IsPublic()`)

| Route | Ghi chú |
|---|---|
| `GET /kanji` | `level` (N5..N1, nhận nhiều), `hanViet` (prefix match `hanVietNorm`), `q` (search `char` hoặc `words[].term`), `page`/`limit` (mặc định 50, max 100 như P2-CONTENT-04). Chỉ `status: PUBLISHED`. |
| `GET /kanji/:char` | Chi tiết. `char` URL-encode (`%E5%AD%A6`) — Nest tự decode. Trả 404 nếu không PUBLISHED. |
| `GET /kanji/levels` | Số kanji PUBLISHED theo từng level — để UI dựng tab N5–N1 mà không hard-code. |

`GET /kanji?hanViet=hoc` → `{ items: [学…] }`. Match là **prefix** trên
`hanVietNorm` (`/^hoc/`), dùng được index. Search kiểu "chứa" (`/hoc/`) sẽ
full-scan — chỉ bật khi `?contains=1` và giới hạn `limit`.

### 5.2. Admin (`@ContentAdmin()`)

| Route | Ghi chú |
|---|---|
| `GET /admin/kanji` | Mọi status, cùng filter như public + `status` |
| `POST /admin/kanji` | Tạo tay (cho chữ ngoài nguồn mở) |
| `PATCH /admin/kanji/:char` | Sửa mọi trường. **`hanVietNorm` tự tính lại khi `hanViet` đổi** — không tin client |
| `DELETE /admin/kanji/:char` | Xoá record; giữ nguyên thẻ SRS đã tạo (card là snapshot, đúng triết lý P3) |
| `POST /admin/kanji/:char/generate` | Gọi AI sinh `mnemonic` (+ dịch `meanings`/`words[].meaning` nếu trống). Trả về bản nháp, **không tự publish** |
| `POST /admin/kanji/:char/deck` | Sinh 1 thẻ SRS vào deck Kanji |

Service: `apps/api/src/content/kanji.service.ts` (tách khỏi `content.service.ts`
đã 363 dòng). Controller thì thêm vào `content.controller.ts` hiện có — kanji là
nội dung học, cùng module. Nếu controller vượt ~350 dòng thì tách
`kanji.controller.ts` riêng.

### 5.3. Gateway UI

Thêm `apps/ui/app/api/kanji/[...route]/route.ts` (public, không cần token) và
`apps/ui/app/api/admin/kanji/[...route]/route.ts` (theo đúng pattern
`admin/content`, token giữ server-side — P2-UI-05).

## 6. SRS — mỗi kanji là 1 thẻ

### 6.1. Schema

`card.schema.ts`:

```ts
export const CARD_KINDS = ["VOCABULARY","GRAMMAR","CUSTOM","KANJI"] as const;

@Prop({ type: Types.ObjectId, ref: "Kanji" })
kanji?: Types.ObjectId | null;
```

`dedupeKey` giữ nguyên (sha256 của front/back/reading) → 1 kanji chỉ thành 1
thẻ trong 1 deck.

### 6.2. Thẻ sinh thế nào

**5 deck chung theo cấp** ("Kanji N5" … "Kanji N1", `user: null`, `shared: true`,
`level` tương ứng). Lý do tách 5 deck thay vì 1: user chọn cấp để học; deck N5
chỉ 79 thẻ nên hàng đợi không bị 1.232 thẻ N1 nhấn chìm, và `newCardsPerDay`
(20/ngày mặc định, đã có) có ý nghĩa thực tế.

Thẻ snapshot:

```text
front:    学
back:     学 (がく / まな.ぶ) · Hán Việt: HỌC · nghĩa: học tập
reading:  がく
hanViet:  HỌC
tags:     ["kanji", "N5"]
origin:   "manual"          ← giữ nguyên enum, không thêm value mới
```

**Không** tự sinh thẻ cho 13.108 chữ. Chỉ sinh khi: (a) admin bấm
`POST /admin/kanji/:char/deck`, hoặc (b) admin bấm nút bulk cho cả cấp (có
progress bar như `example-job-tracker` hiện có).

### 6.3. Học

Không đụng engine SM-2. Kanji card vào chung hàng đợi `/learn/study`. Tiến độ
theo `(user, card)` như mọi thẻ khác.

## 7. UI

### 7.1. `/learn/kanji` — danh sách

Grid thẻ lớn: chữ kanji, Hán Việt, on/kun, badge level.

- **Tab cấp**: N5 · N4 · N3 · N2 · N1 · Tất cả (số lượng lấy từ `GET /kanji/levels`).
- **Ô search "Tìm theo âm Hán Việt"**: gõ `hoc` → `GET /kanji?hanViet=hoc`.
  Client **không** bỏ dấu (server đã chuẩn hoá) — gõ có dấu hay không đều ra.
  Debounce 250ms, huỷ request cũ.
- Phân trang.

### 7.2. `/learn/kanji/[char]` — chi tiết

Bố cục hai cột (mobile xếp dọc):

- **Trái**: chữ lớn + **khung animate thứ tự nét** (SVG 109×109, nét vẽ dần
  theo `stroke-dashoffset`, nút ▶ Chạy lại / từng nét / ẩn số nét). Kèm credit
  KanjiVG (bắt buộc — CC BY-SA).
- **Phải**: Hán Việt · onyomi · kunyomi · nghĩa · **liên tưởng** (khối nổi bật)
  · số nét · bộ thủ.
- **Dưới**: bảng từ vựng liên quan (term · reading · nghĩa · level), mỗi từ click
  được sang kanji chứa nó nếu có record.
- Nút "Thêm vào bộ thẻ của tôi" (dùng API save sẵn có) + "Ôn ngay".

### 7.3. `/learn/page.tsx`

Thêm ô "Kanji" vào lưới hiện có (đang có Flashcard / SRS / Bài tập / Luyện nghe).

### 7.4. `/admin/(panel)/kanji`

**Tab riêng**, không nhét vào `content-console.tsx` (form kanji nhiều trường phức
tạp: onyomi/kunyomi là mảng, words là mảng object, strokes không sửa tay).

- Bảng list: chữ · Hán Việt · level · số từ · trạng thái · nút sửa/xoá.
- Filter: level, status, ô search Hán Việt (dùng chung logic public).
- Form: chữ (khoá khi sửa) · level (select) · Hán Việt (input, có gợi ý bảng
  curate) · onyomi/kunyomi (textarea, mỗi dòng một âm) · nghĩa (mảng, mỗi dòng
  một nghĩa) · liên tưởng (textarea) · từ vựng (bảng thêm/xoá dòng) · status.
- Nút **"✨ Sinh liên tưởng"** và **"Dịch nghĩa"** → gọi AI, điền form, admin
  duyệt rồi mới bật PUBLISHED.
- Nút **"Thêm vào deck Kanji N5"**.

## 8. Task (thêm `docs/IMPLEMENTATION_CHECKLIST.md`, mục P3.5 — Kanji)

> **Theo quyết định 03/11/2026 trong checklist:** không viết test file ở P1–P10,
> test dồn về P11. Vì vậy các mục dưới đây verify bằng `curl`/thao tác trình
> duyệt, **không** thêm file `.spec.ts` — trừ P3K-03 (`hanVietNorm` là hàm thuần,
> rẻ và dễ sai, đáng có test ngay).

| ID | Mô tả | Phụ thuộc | Chứng minh | TT |
|---|---|---|---|---|
| P3K-01 | Tách bảng Hán Việt sang `packages/shared/han-viet.json`; `apps/ui/lib/han-viet.ts` import lại, giữ API `hanViet()` | — | `pnpm --filter @nihongo/ui build` xanh (`bf68798`) | `[x]` |
| P3K-02 | Schema `Kanji` + `RelatedWord` + index (`char` unique, `{status, level, rank}`, `{status, hanVietNorm}`) | P3K-01 | `kanji.schema.ts` | `[x]` |
| P3K-03 | Hàm chuẩn hoá `hanVietNorm` (bỏ dấu) + unit test | P3K-02 | `han-viet-norm.spec.ts` | `[x]` |
| P3K-04 | Script `import-kanji.mjs` + `kanji-lib.mjs`: tải 3 nguồn + Unihan, ghép Hán Việt 3 tầng (2129/2136 Jōyō), trích path KanjiVG; test chặn khoá `wk_*` + không sửa `d` (`kanji-lib.spec.ts`) | P3K-03 | `kanji-lib.spec.ts` + `import-kanji.mjs` | `[x]` |
| P3K-05 | `KanjiService` + public routes (`GET /kanji`, `/kanji/:char`, `/kanji/levels`) | P3K-02 | `kanji.controller.ts`, `kanji.service.ts` | `[x]` |
| P3K-06 | Admin routes (`GET/POST/PATCH/DELETE /admin/kanji*` + `hanVietNorm` tự tính) | P3K-05 | `kanji.controller.ts`, `kanji.service.ts` | `[x]` |
| P3K-07 | AI: dịch lười nghĩa từ vựng liên quan (ưu tiên `vocabulary`/`flashcards` có sẵn trước, phần thiếu gọi `translateWords`) + sinh liên tưởng | P3K-05 | đã có `fillWordMeanings` (`kanji.service.ts`); chưa có route sinh `mnemonic` riêng | `[~]` |
| P3K-08 | Card: `kind: KANJI` + ref `kanji`; 5 deck chung N5–N1; API sinh thẻ | P3K-06, P3-CARD-02 | 1 kanji = 1 card/deck (unique) | `[ ]` |
| P3K-09 | UI `/learn/kanji` (tab cấp + search Hán Việt) | P3K-05 | `kanji-browser.tsx` | `[x]` |
| P3K-10 | UI `/learn/kanji/[char]` (animate nét vẽ + **dòng credit KanjiVG có link**) | P3K-09 | `kanji-detail.tsx`, `stroke-order.tsx` | `[x]` |
| P3K-11 | UI admin `/admin/kanji` (list, form, nút AI, nút deck) | P3K-07 | sinh liên tưởng → sửa → publish | `[ ]` |
| P3K-12 | Link Kanji ở `/learn/page.tsx`; `database.md` (collection + index + **giấy phép từng trường**); trang `/credits` ghi công EDRDG + KanjiVG | P3K-09 | đã thêm link ở `/learn/page.tsx` và giấy phép trong `database.md`; chưa có trang `/credits` riêng | `[~]` |

**Thứ tự:** 01 → 02 → 03 → 04 (nạp data) → 05 → 06 → 07 → 08 → 09 → 10 → 11 → 12.

**Điểm ship được (MVP):** P3K-01…06 + 09 + 10 + 12 — học kanji, tra cứu, search
Hán Việt, xem thứ tự nét, level N5–N1. Chưa cần AI, chưa cần SRS.
**Phase 2:** P3K-07, 08, 11 — liên tưởng AI + thẻ SRS + admin đầy đủ.

Lý do tách: on/kun/Hán Việt/nét vẽ/từ vựng đã phủ 78–100% từ nguồn mở, nên
MVP **không phụ thuộc AI**. Liên tưởng là thứ duy nhất bắt buộc cần AI, và nó
không chặn việc học.

## 9. Điểm cần chốt khi triển khai

| # | Vấn đề | Đề xuất |
|---|---|---|
| Q-K1 | Nghĩa tiếng Việt của kanji (không nguồn mở nào có) | `meaningsEn` có sẵn từ nguồn; nghĩa Việt dịch lười bằng nút AI trong admin, ưu tiên N5 trước |
| Q-K2 | 84 chữ N1 thiếu Hán Việt | Để trống, admin nhập; UI hiện "—"; không chặn publish |
| Q-K3 | Kanji ngoài JLPT (10.897 chữ) có nạp không | Mặc định **không**; `--all` khi cần. Chúng cũng không có trong JMdict common → từ vựng trống |
| Q-K4 | Nghĩa tiếng Việt của từ vựng liên quan | **Đã chốt:** `glossEn` từ JMdict, `meaning` để trống, AI dịch lười + cache (§2.4) |
| Q-K5 | Có cần "luyện viết" (user tô nét, chấm điểm) ở MVP không | Không. Nét vẽ đã có path từng nét nên tự vẽ được animation; phần chấm điểm nét vẽ cần thêm thuật toán, để sau |
| Q-K6 | `strokes` 1,9 MB nằm trong document kanji | Chấp nhận. Mongo doc ~1 KB, tổng ~2–3 MB cho 2.211 chữ. Nếu sau này cần >10k chữ thì tách `kanjistrokes` |

## 10. Đóng gói thành sản phẩm riêng — ràng buộc giấy phép

Bộ kanji sẽ được đóng gói bán. Đây là phần quyết định cái gì **bán được độc
quyền** và cái gì **không**.

### 10.1. Bảng giấy phép

| Dữ liệu | Nguồn | Giấy phép | Bán được? | Ràng buộc |
|---|---|---|---|---|
| Chữ, on/kun, level, số nét | KANJIDIC (EDRDG) qua kanji-data | CC BY-SA 4.0 | ✅ Có | Ghi công; **dữ liệu thô giữ CC BY-SA** |
| **Thứ tự nét** | **KanjiVG (Ulrich Apel)** | **CC BY-SA 3.0** | ✅ Có | **Share Alike — xem 10.2** |
| Từ vựng (term, reading) | JMdict (EDRDG) | CC BY-SA 4.0 | ✅ Có | Ghi công EDRDG |
| Hán Việt | bảng curate repo | nội bộ | ✅ Có | Không ràng buộc (của bạn) |
| Hán Việt (bổ sung) | `hanviet-pinyin-words` | MIT | ✅ Có | Ghi công |
| ~~Bộ thủ, level WaniKani~~ | ~~WaniKani API~~ | ~~Cấm~~ | ❌ **Không** | **Không dùng trường `wk_*`** |
| Code, engine SRS, UI | của bạn | — | ✅ Có | Không ràng buộc |
| Liên tưởng, nghĩa Việt | AI sinh + admin biên tập | của bạn | ✅ Có | Không ràng buộc |

Trang licence EDRDG nói rõ: *"there is NO restriction placed on commercial use
of the files. The files can be bundled with software and sold for whatever the
developer wants to charge. Software using these files does not have to be under
any form of open-source licence."* → **Bán app/dịch vụ thì không vướng gì.**

### 10.2. Hệ quả cụ thể của KanjiVG CC BY-SA 3.0

Điều 4(b) của CC BY-SA 3.0: bản *Adaptation* chỉ được phân phối theo CC BY-SA.
Path nét vẽ trích từ KanjiVG, lưu vào Mongo rồi phát hành kèm sản phẩm = phân
phối bản sao/bản phái sinh.

| Việc muốn làm | Được không |
|---|---|
| Bán quyền truy cập app, tính phí thuê bao | ✅ Được — CC không cấm thương mại |
| Đóng gói bộ dữ liệu kanji và bán như một sản phẩm | ✅ Được, **nhưng** người mua có quyền sao chép & chia sẻ lại phần path nét vẽ dưới CC BY-SA |
| Cấm người mua trích xuất 2.211 path nét vẽ | ❌ Không được |
| Ghi "bộ dữ liệu này là tài sản độc quyền" cho toàn bộ | ❌ Không được với phần nét vẽ |
| Bán engine SRS / UI / AI / nghĩa tiếng Việt như tài sản riêng | ✅ Được — những phần đó không bị CC ràng buộc |
| Dùng DRM chặn người dùng truy cập path nét vẽ | ❌ Không được — điều 4(a) cấm |

**Nghĩa vụ bắt buộc:**

1. Ghi công ở nơi người dùng thấy: "Nét vẽ: KanjiVG © Ulrich Apel, CC BY-SA
   3.0" + link `https://kanjivg.tagaini.net`, ngay trên trang chi tiết kanji
   (không chỉ trong footer hay file LICENSE).
2. Kèm bản hoặc URI của CC BY-SA 3.0 khi phân phối.
3. Không dùng lại tên/logo KanjiVG để ngụ ý KanjiVG chứng thực sản phẩm.
4. Ghi công EDRDG (KANJIDIC + JMdict) — cũng CC BY-SA, cùng nghĩa vụ.

### 10.3. Ranh giới "Collection" vs "Adaptation"

Điểm này quyết định sản phẩm của bạn có bị "lây" CC BY-SA hay không:

- **Collection** (điều 1): ghép các tác phẩm **nguyên vẹn** cạnh nhau → *không*
  phải Adaptation → **phần khác của collection không phải theo CC BY-SA**.
  (Điều 4(a): "this does not require the Collection apart from the Work itself
  to be made subject to the terms of this License.")
- **Adaptation**: biến đổi path gốc (đổi toạ độ, gộp nét, vẽ lại cho khác đi) →
  phải theo CC BY-SA.

Kết luận thực dụng: **giữ path KanjiVG nguyên vẹn từng chuỗi `d`**, không biến
đổi hình học. Khi đó sản phẩm là một Collection: path giữ CC BY-SA, còn schema,
code, AI, nghĩa Việt, Hán Việt là tài sản riêng của bạn. Nếu cần biến đổi (ví
dụ chuẩn hoá khung toạ độ), làm **lúc render ở client** chứ không sửa dữ liệu
đã lưu — như vậy DB vẫn giữ bản nguyên vẹn.

→ Ràng buộc kỹ thuật: script nạp **không được** sửa nội dung thuộc tính `d`.
Cần transform thì để CSS `transform` / `viewBox` ở tầng hiển thị.

### 10.4. Việc phải làm trong code

| Nơi | Việc |
|---|---|
| `docs/database.md` | Ghi giấy phép từng trường + ràng buộc WaniKani + nghĩa vụ CC BY-SA |
| `/learn/kanji/[char]` | Dòng credit KanjiVG có link, ngay dưới khung nét vẽ |
| Footer hoặc trang `/credits` | Ghi công EDRDG (KANJIDIC, JMdict), KanjiVG, `hanviet-pinyin-words` |
| Script nạp | Test khẳng định không có khoá `wk_*`; không biến đổi `d` |
| Gói dữ liệu bán ra (nếu có) | Kèm `LICENSE-KANJIVG.txt` (CC BY-SA 3.0) + `LICENSE-EDRDG.txt` |

> **Nếu sau này cần độc quyền hoàn toàn phần nét vẽ:** phải vẽ lại 2.211 chữ
> bằng nguồn khác (thuê vẽ, hoặc bộ font có giấy phép cho phép — lưu ý OFL cũng
> có ràng buộc riêng). Plan này **không** làm việc đó; chỉ cần biết đường thoát
> nằm ở đâu: schema đã tách `strokes` thành một mảng riêng, thay dữ liệu không
> đụng gì khác.

## 11. Rủi ro

- **Phụ thuộc 3 nguồn ngoài khi nạp.** Script cache về `apps/api/data/kanji/`
  và chỉ tải khi thiếu → nạp lại không cần mạng. Nếu một URL chết, script báo
  rõ file nào thiếu và dừng, không ghi nửa vời.
- **`hanvietData` sinh tự động, có chỗ lệch chuẩn** (割 → `cắt` thay vì `cát`,
  受 → `thọ` thay vì `thụ`, 万 → `mặc` thay vì `vạn`). Vì vậy bảng curate phải
  **luôn thắng**. Đã đo: trong 897 chữ curate, 795 khớp `hanvietData`, 26 lệch
  (giữ theo curate), 76 chữ shinjitai phải đi qua cầu phồn thể. Bộ số này nên
  được ghi thành fixture test để lần sau không ai "sửa" nhầm theo hướng sai.
- **KanjiVG share-alike** — ràng buộc cứng khi bán, xem §10.2–10.3. Rủi ro thực
  tế không phải "không bán được" mà là **người mua chia sẻ lại phần nét vẽ**.
  Chấp nhận được vì giá trị sản phẩm nằm ở trải nghiệm học, không ở 1,9 MB path.
- **WaniKani** — `kanji-data` có 5 trường `wk_*` không dùng được cho thương mại.
  Ràng buộc bằng test, xem §2.1.
- **Dung lượng** — 2.211 doc × ~1 KB ≈ 3 MB, không đáng lo. 13.108 chữ đầy đủ
  ≈ 15–20 MB, vẫn ổn nhưng mặc định không nạp.
- **Search Hán Việt có dấu** — `hanVietNorm` bỏ dấu nên "học"/"hoc" đều khớp;
  nhưng người gõ "hoà" vs "hòa" (hai kiểu đặt dấu) cũng khớp vì cùng bỏ dấu về
  `hoa`. Đây là lý do **không** dùng `$text` hay so khớp chuỗi thô.