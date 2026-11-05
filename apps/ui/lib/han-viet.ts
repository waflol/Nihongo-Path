/**
 * Sino-Vietnamese (âm Hán Việt) readings of common kanji — JLPT N5–N3 and
 * frequent extras. Hand-curated: the Unihan `kVietnamese` field was checked
 * and rejected (it lists plain quốc ngữ readings such as 強 "càng" and misses
 * 食/学/国/北/犬/猫/静). Kanji not listed simply show no reading.
 *
 * Format: `<kanji><reading>` pairs separated by whitespace; when a kanji has
 * two common readings they are joined with "/" (e.g. 長 trường/trưởng).
 */
const RAW = `
日nhật 一nhất 国quốc 人nhân 年niên 大đại 十thập 二nhị 本bản 中trung 長trường/trưởng 出xuất 三tam 時thời 行hành/hạnh 見kiến 月nguyệt 後hậu 前tiền 生sinh 五ngũ 間gian 上thượng 東đông 四tứ 今kim 金kim 九cửu 入nhập 学học 高cao 円viên 子tử 外ngoại 八bát 六lục 下hạ 来lai 気khí 小tiểu 七thất 山sơn 話thoại 女nữ 北bắc 午ngọ 百bách 書thư 先tiên 名danh 川xuyên 千thiên 水thủy 半bán 男nam 西tây 電điện 校hiệu 語ngữ 土thổ 木mộc 聞văn 食thực 車xa 何hà 南nam 万vạn 毎mỗi 白bạch 天thiên 母mẫu 火hỏa 右hữu 読độc 友hữu 左tả 休hưu 父phụ 雨vũ
会hội 同đồng 事sự 自tự 社xã 発phát 者giả 地địa 業nghiệp 方phương 新tân 場trường 員viên 立lập 開khai 手thủ 力lực 問vấn 代đại 明minh 動động 京kinh 目mục 通thông 言ngôn 理lý 体thể 田điền 主chủ 題đề 意ý 不bất 作tác 用dụng 度độ 強cường 公công 持trì 野dã 以dĩ 思tư 家gia 世thế 多đa 正chính 安an 院viện 心tâm 界giới 教giáo 文văn 元nguyên 重trọng 近cận 考khảo 画họa 海hải 売mại 知tri 道đạo 集tập 別biệt 物vật 使sử 品phẩm 計kế 死tử 特đặc 私tư 始thủy 朝triều 運vận 終chung 台đài 広quảng 住trú 真chân 有hữu 口khẩu 少thiểu 町đinh 料liệu 工công 建kiến 空không 急cấp 止chỉ 送tống 切thiết 転chuyển 研nghiên 足túc 究cứu 楽nhạc/lạc 起khởi 着trước 店điếm 病bệnh 質chất 待đãi 試thí 族tộc 銀ngân 早tảo 映ánh 親thân 験nghiệm 英anh 医y 仕sĩ 去khứ 味vị 写tả 字tự 答đáp 夜dạ 音âm 注chú 帰quy 古cổ 歌ca 買mãi 悪ác 図đồ 週chu 室thất 歩bộ 風phong 紙chỉ 黒hắc 花hoa 春xuân 赤xích 青thanh 館quán 屋ốc 色sắc 走tẩu 秋thu 夏hạ 習tập 駅dịch 洋dương 旅lữ 服phục 夕tịch 借tá 曜diệu 飲ẩm 肉nhục 貸thải 堂đường 鳥điểu 飯phạn 勉miễn 冬đông 昼trú 茶trà 弟đệ 牛ngưu 魚ngư 兄huynh 犬khuyển 妹muội 姉tỉ 漢hán
政chính 議nghị 民dân 連liên 対đối 部bộ 合hợp 市thị 内nội 相tương 定định 回hồi 選tuyển 米mễ 実thực 関quan 決quyết 全toàn 表biểu 戦chiến 経kinh 最tối 現hiện 調điều 化hóa 当đương 約ước 首thủ 法pháp 性tính 的đích 要yếu 制chế 治trị 務vụ 成thành 期kỳ 取thủ 都đô 和hòa 機cơ 平bình 加gia 受thụ 続tục 進tiến 数số 記ký 初sơ 指chỉ 権quyền 支chi 産sản 点điểm 報báo 済tế 活hoạt 原nguyên 共cộng 得đắc 解giải 交giao 資tư 予dự 向hướng 際tế 勝thắng 面diện 告cáo 反phản 判phán 認nhận 参tham 利lợi 組tổ 信tín 在tại 件kiện 側trắc 任nhiệm 引dẫn 求cầu 所sở 次thứ 昨tạc 論luận 官quan 増tăng 係hệ 感cảm 情tình 投đầu 示thị 変biến 打đả 直trực 両lưỡng 式thức 確xác 果quả 容dung 必tất 演diễn 歳tuế 争tranh 談đàm 能năng 位vị 置trí 流lưu 格cách 疑nghi 過quá 局cục 放phóng 常thường 状trạng 球cầu 職chức 与dữ 供cung 役dịch 構cấu 割cát 費phí 付phó 由do 説thuyết 難nan 優ưu 夫phu 収thu 断đoạn 石thạch 違vi 消tiêu 神thần 番phiên 規quy 術thuật 備bị 宅trạch 害hại 配phối 警cảnh 育dục 席tịch 訪phỏng 乗thừa 残tàn 想tưởng 声thanh 助trợ 労lao 例lệ 然nhiên 限hạn 追truy 商thương 葉diệp 伝truyền 働động 形hình 景cảnh 落lạc 好hảo/hiếu 退thoái 頭đầu 負phụ 渡độ 失thất 差sai 末mạt 守thủ 若nhược 種chủng 美mỹ 命mệnh 福phúc 望vọng 非phi 観quan 察sát 段đoạn 横hoành 深thâm 申thân 様dạng 財tài 港cảng 識thức 呼hô 達đạt 良lương 候hậu 程trình 満mãn 敗bại 値trị 突đột 光quang 路lộ 科khoa 積tích 他tha 処xử 太thái 客khách 否phủ 師sư 登đăng 易dị 速tốc 存tồn 飛phi 殺sát 号hiệu 単đơn 座tọa 破phá 除trừ 完hoàn 降giáng 責trách 捕bổ 危nguy 給cấp 苦khổ 迎nghênh 園viên 具cụ 辞từ 因nhân 馬mã 愛ái 富phú 彼bỉ 未vị 舞vũ 亡vong 冷lãnh 適thích 婦phụ 寄ký 顔nhan 類loại 余dư 王vương 返phản 妻thê 背bối 熱nhiệt 宿túc 薬dược 険hiểm 頼lại 覚giác 船thuyền 途đồ 許hứa 抜bạt 便tiện 留lưu 罪tội 努nỗ 精tinh 散tán 静tĩnh 婚hôn 喜hỷ 浅thiển 弁biện 絡lạc 遊du 謝tạ 鮮tiên 税thuế
猫miêu 羊dương 虫trùng 草thảo 林lâm 森sâm 雪tuyết 雲vân 星tinh 池trì 耳nhĩ 鼻tị 歯xỉ 血huyết 骨cốt 腹phúc 髪phát 低đê 弱nhược 軽khinh 遠viễn 狭hiệp 細tế 厚hậu 薄bạc 暑thử 寒hàn 暖noãn 涼lương 暗ám 忙mang 暇hạ 悲bi 怒nộ 恐khủng 驚kinh 笑tiếu 泣khấp 踊dũng 寝tẩm 脱thoát 洗tẩy 泳vịnh 遅trì 配phối 貧bần 豊phong 緑lục 紫tử 黄hoàng 桜anh 橋kiều 池trì 港cảng 駐trú 乾can 湖hồ 島đảo 岩nham 庭đình 窓song 門môn 戸hộ 階giai 鉄thiết 銅đồng 鋭nhuệ 技kỹ 師sư 授thụ 講giảng 義nghĩa 祭tế 礼lễ 式thức 宗tông 仏phật 教giáo 婦phụ 孫tôn 両lưỡng 祖tổ 姓tính 児nhi 童đồng 幼ấu 若nhược 老lão 命mệnh 医y 看khán 療liệu 患hoạn 薬dược 症chứng 痛thống 熱nhiệt 疲bì 眠miên 夢mộng
身thân 眼nhãn 眉mi 舌thiệt 肩kiên 胸hung 脳não 腕uyển 爪trảo 皮bì 毛mao 脈mạch 胃vị 腸trường 肺phế 臓tạng 筋cân 肌cơ 汗hãn 涙lệ 胆đảm 叔thúc 伯bá 姪điệt 甥sanh 嫁giá 婿tế 姑cô 妃phi 姫cơ 娘nương 嬢nương
雷lôi 嵐lam 霧vụ 霜sương 氷băng 波ba 浪lãng 潮triều 湾loan 河hà 沼chiểu 泉tuyền 谷cốc 丘khâu 崖nhai 岸ngạn 竹trúc 松tùng 梅mai 柳liễu 菊cúc 蘭lan 稲đạo 麦mạch 豆đậu 栗lật 芋vu 菜thái 根căn 枝chi 幹cán 芽nha 苗miêu 茎hành 豚đồn 鶏kê 虎hổ 象tượng 熊hùng 狼lang 狐hồ 鹿lộc 猿viên 兎thố 鼠thử 蛇xà 竜long 亀quy 蛙oa 蝶điệp 蜂phong 蚊văn 蟻nghĩ 貝bối 蟹giải 鯨kình 鳴minh 羽vũ 翼dực 衣y
靴ngoa 帽mạo 傘tản 鏡kính 針châm 布bố 綿miên 絹quyên 麻ma 皿mãnh 器khí 箱tương 瓶bình 缶phữu 鍋oa 刀đao 剣kiếm 弓cung 矢thỉ 槍thương 鋼cương 城thành 寺tự 塔tháp 区khu 郡quận 県huyện 村thôn 郷hương 里lý 街nhai 域vực 圏khuyên 境cảnh 壁bích 床sàng 柱trụ 梁lương 庫khố 舗phố 廊lang
昔tích 暮mộ 晩vãn 旬tuần 刻khắc 秒miễu 億ức 兆triệu 倍bội 第đệ 恋luyến 憎tăng 恨hận 憂ưu 悩não 怖bố 幸hạnh 才tài 芸nghệ 勤cần 農nông 漁ngư 鉱khoáng 護hộ 律luật 憲hiến 令lệnh 条điều 項hạng 罰phạt 刑hình 裁tài 訴tố 検kiểm 査tra 証chứng 拠cứ 被bị 犯phạm 盗đạo 暴bạo 乱loạn 軍quân 兵binh 隊đội 基cơ 準chuẩn
貨hóa 貯trữ 預dự 払phất 価giá 額ngạch 総tổng 算toán 損tổn 益ích 貿mậu 輸thâu 減giảm 到đáo 移di 揺dao 振chấn 揮huy 抱bão 拾thập 捨xả 拡khuếch 縮súc 伸thân 曲khúc 折chiết 壊hoại 裂liệt 閉bế 絶tuyệt 救cứu 防phòng
誤ngộ 善thiện 賢hiền 愚ngu 硬ngạnh 軟nhuyễn 固cố 柔nhu 鈍độn 濃nồng 淡đạm 甘cam 辛tân 酸toan 灰hôi 徒đồ 塾thục 課khóa 詩thi 句cú 章chương 節tiết 編biên 刊san 誌chí 版bản 印ấn 刷loát 筆bút 墨mặc
帝đế 皇hoàng 君quân 臣thần 僧tăng 祈kỳ 祝chúc 霊linh 魂hồn 魔ma 鬼quỷ 仙tiên 虚hư 偽ngụy 仮giả 型hình 況huống 態thái 勢thế 志chí 願nguyện 希hy 哀ai 念niệm 憶ức 忘vong 敬kính 尊tôn 誇khoa 恥sỉ 勇dũng 刺thích 押áp 宙trụ 宇vũ 陽dương 陰âm 影ảnh 闇ám 輝huy 灯đăng 炎viêm 煙yên 焼thiêu 燃nhiên 爆bạo
`;

export const HAN_VIET: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const re = /([㐀-䶿一-鿿々])([^\s㐀-䶿一-鿿々]+)/g;
  for (const m of RAW.matchAll(re)) map[m[1]] = m[2];
  return map;
})();

/**
 * Hán Việt of every kanji in `text`, upper-cased and space separated:
 * "山" → "SƠN", "日本" → "NHẬT BẢN", "食べる" → "THỰC". `""` when no kanji of
 * the text is known (kana-only words, rare kanji).
 */
export function hanViet(text: string): string {
  const out: string[] = [];
  for (const ch of text) {
    const v = HAN_VIET[ch];
    if (v) out.push(v.toLocaleUpperCase("vi"));
  }
  return out.join(" ");
}
