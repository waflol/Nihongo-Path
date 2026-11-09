/**
 * Pure helpers for import-kanji.mjs (plan-kanji §4) — no network, no DB, so
 * they can be unit-tested. Two hard constraints live here:
 *  - only whitelisted KANJIDIC-derived fields are read from kanji-data;
 *    WaniKani (`wk_*`) fields are licence-forbidden (plan §2.1);
 *  - KanjiVG stroke `d` strings are copied verbatim (CC BY-SA, plan §10.3).
 */

/** The only kanji-data fields we read (all EDRDG/KANJIDIC origin). */
export const SAFE_KANJI_DATA_FIELDS = [
  "strokes",
  "grade",
  "freq",
  "jlpt_new",
  "readings_on",
  "readings_kun",
  "meanings",
];

export function pickKanjiData(rec) {
  const out = {};
  for (const k of SAFE_KANJI_DATA_FIELDS) if (k in rec) out[k] = rec[k];
  return out;
}

/** Per-stroke path data from a KanjiVG SVG, in stroke order, `d` untouched. */
export function extractStrokePaths(svg) {
  const paths = [];
  const re = /<path\b[^>]*>/g;
  for (const m of svg.matchAll(re)) {
    const tag = m[0];
    if (!/\bid="kvg:[^"]*-s\d+"/.test(tag)) continue;
    const d = tag.match(/\sd="([^"]*)"/);
    if (d) paths.push(d[1]);
  }
  return paths;
}

const isKanji = (c) => /[㐀-䶿一-鿿]/.test(c);

/** Map kanji → up to `max` common JMdict words that contain it. */
export function wordsByKanji(jmdict, max = 5) {
  const out = new Map();
  for (const w of jmdict.words ?? []) {
    const k = (w.kanji ?? []).find((x) => x.common && !(x.tags ?? []).some((t) => /^(sK|oK|iK|rK)$/.test(t)));
    if (!k || [...k.text].length > 6) continue;
    const reading = w.kana?.[0]?.text ?? "";
    const glossEn = (w.sense?.[0]?.gloss ?? []).map((g) => g.text).slice(0, 3).join("; ");
    const chars = [...k.text].filter(isKanji);
    for (const ch of new Set(chars)) {
      const list = out.get(ch) ?? [];
      list.push({ term: k.text, reading, meaning: "", glossEn, chars: [...k.text] });
      out.set(ch, list);
    }
  }
  for (const [ch, list] of out) {
    // Prefer short words that start with the kanji, then shorter overall.
    list.sort((a, b) => Number(b.term.startsWith(ch)) - Number(a.term.startsWith(ch)) || a.term.length - b.term.length);
    out.set(ch, list.slice(0, max));
  }
  return out;
}

const canonTone = (s) =>
  s
    .normalize("NFC")
    .toLocaleLowerCase("vi")
    .trim()
    .replace(/oà/g, "òa")
    .replace(/oá/g, "óa")
    .replace(/oả/g, "ỏa")
    .replace(/oã/g, "õa")
    .replace(/oạ/g, "ọa")
    .replace(/oè/g, "òe")
    .replace(/oé/g, "óe")
    .replace(/oẻ/g, "ỏe")
    .replace(/oẽ/g, "õe")
    .replace(/oẹ/g, "ọe")
    .replace(/uỳ/g, "ùy")
    .replace(/uý/g, "úy")
    .replace(/uỷ/g, "ủy")
    .replace(/uỹ/g, "ũy")
    .replace(/uỵ/g, "ụy");

/** Same rule as server-side `hanVietNorm` (kept in sync by hand). */
export function hanVietNorm(s) {
  const raw = Array.isArray(s) ? s.join("/") : String(s ?? "");
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .split(/[/,;|·、\s]+/)
    .filter(Boolean)
    .join("/");
}

/** Unique readings of one `hanvietData` entry ({pinyin|'*': [reading]}), deduplicated by canonical tone. */
export function readingsOf(entry) {
  if (!entry) return [];
  const seen = new Set();
  const out = [];
  for (const r of Object.values(entry).flat()) {
    const clean = String(r ?? "").trim().toLocaleLowerCase("vi");
    const key = canonTone(clean);
    if (clean && !seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

/**
 * Hán Việt for a kanji. Priority (plan §2.2): curated table → hanvietData
 * (direct, then via Unihan traditional/simplified variants) → Unihan
 * kVietnamese. Several readings are joined with "/".
 */
export function resolveHanViet(ch, { curated, hvData, variants, kViet }) {
  if (curated[ch]) return curated[ch];
  for (const c of [ch, ...(variants.get(ch) ?? [])]) {
    const r = readingsOf(hvData[c]);
    if (r.length) return r.slice(0, 4).join("/");
  }
  for (const c of [ch, ...(variants.get(ch) ?? [])]) {
    if (kViet.get(c)) {
      return kViet
        .get(c)
        .split(/\s+/)
        .map((x) => x.trim().toLocaleLowerCase("vi"))
        .filter(Boolean)
        .slice(0, 4)
        .join("/");
    }
  }
  return "";
}

/** Parse Unihan_Variants.txt / Unihan_Readings.txt lines into maps. */
export function parseUnihan(text, fields) {
  const out = Object.fromEntries(fields.map((f) => [f, new Map()]));
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || !line.includes("\t")) continue;
    const [cp, field, value] = line.split("\t");
    if (!out[field]) continue;
    out[field].set(String.fromCodePoint(parseInt(cp.slice(2), 16)), value);
  }
  return out;
}

/** Level bands over the 1-based rank of the 2136 Jōyō kanji (user spec). */
export const LEVEL_BANDS = [
  ["N5", 1, 120],
  ["N4", 121, 320],
  ["N3", 321, 720],
  ["N2", 721, 1200],
  ["N1", 1201, 2136],
];

export function levelForRank(rank) {
  return LEVEL_BANDS.find(([, from, to]) => rank >= from && rank <= to)?.[0] ?? "";
}

/**
 * Fixed N5 learning order (120 chars, rank 1-120), read left→right, top→bottom
 * from the product's reference screens (#29 is 毎, the Jōyō form).
 */
export const N5_ORDER = [
  ..."一二三四五六七八九十百千万円今日月火水木",
  ..."金土週年何時間分毎半夕人口手足目耳体力山",
  ..."森林石岩川雨田畑花竹明暗音上下左右内外中",
  ..."方東西南北町寺電車入出門大小多少高安古新",
  ..."長元気父母男女子好犬学校先生名友字本書見",
  ..."聞行立休来帰言話読買食飲米茶魚鳥貝牛肉物",
];

/** Fixed N4 learning order (200 chars, rank 121-320), same reading order as N5. */
export const N4_ORDER = [
  ..."家族親主夫婦奥兄弟姉妹私部屋宅教育室店広",
  ..."低近遠静午前後早朝昼晩夜色白黒赤黄青緑紙",
  ..."自然風谷地天海洋池湖草原空星光雪雲晴寒暑",
  ..."辺春夏秋冬勉強弱世界王国京都道府県市区村",
  ..."住所様番号羽虫鳴馬玉糸毛駅鉄乗遅速開閉発",
  ..."着衣服短重軽質問宿題集答写真船便利歴史味",
  ..."油太細皿飯麦若知酒楽歌声映画図館公園切有",
  ..."料理心思考特病院医科待合計薬練習運動歩走",
  ..."泳才政治経済研究英語漢文試験不正同化数台",
  ..."交通会社工場働作始終荷送急客売品当旅持使",
];

/**
 * Fixed N3 learning order, same reading order. These 19 pages (380 chars) come
 * from the source screens; the 6th N3 page (ranks 421-440) is N3_PAGE_6 below,
 * so N3_ORDER[100..] is shifted 20 ranks down in PINNED_BLOCKS (see the swap there).
 */
export const N3_ORDER = [
  ..."去止丸銀里野起寝浴湯洗濯活干袋拾捨燃曜末",
  ..."昨翌予定用事押引取消戸窓階段植葉実根建築",
  ..."構造設柱庫向熱冷温度材型焼器卵乳粉塩菜果",
  ..."豆缶杯枚匹量頭顔首鼻呼吸息汗検査歯痛血液",
  ..."包帯救助死亡戦決勝負代表第回記録優賞秒差",
  ..."達個性各格単複全以未満無非幼児童徒担任師",
  ..."笑喜残念泣涙結婚紹介独身貯期約束必守式列",
  ..."祝酔永願幸福関係和付娘老姓仲君彼他初再久",
  ..."組机座板筆貸借返冊具箱棒伸希望夢的可能調",
  ..."選面接受落倍率平均成績良悪授業級卒欠席由",
  ..."訳例易解説覚忘努続要復補効種類存在陽巨氷",
  ..."河季候暖流形底深浅島陸岸坂準備迎変飛移登",
  ..."泊団程欧州観舟芸演仏神祭絵角曲折路追突転",
  ..."倒位置横央直線逆側注意橋進仕職求探常識失",
  ..."礼労員官局辞退積給収支厚議賛反対肯否保留",
  ..."判断確認報告連絡相談指示最副管者現旧昔次",
  ..."億兆費算供税産農貿商機械危険技術編綿布皮",
  ..."貧富豊等法律規則禁許件犯罪容疑争敗兵軍役",
  ..."臣妻宮降替配届渡券招贈含混溶汁丼盛契越賃",
];

/** N3 page 6 (ranks 421-440), as shown in the source screen. */
export const N3_PAGE_6 = [..."測順球打投点感情恋愛信想伝欲苦悩困難怒悲"];

/** Fixed N2 learning order (ranks 721-1020, 15 pages of 20). */
export const N2_ORDER = [
  ..."仮証域雑誌刊並巻著居庭清掃整汚駐輪港到途",
  ..."過符停標普刻違漁輸製郵航融戻換払込両照預",
  ..."札貨帳振桜梅松杉美香脱掛姿勢柔軟固純快甘",
  ..."濃薄劇舞堂展宗恵宝城栄蔵昭健康診療命異背",
  ..."腹肩腕胸腰脳臓胃筋骨節症状因況態圧傷処触",
  ..."針抜完忙疲慣競養兼就従応訪課論採募雇適般",
  ..."総企案依頼比較評価改善勤務営景資益株債販",
  ..."購値額財納増減損得拡縮略充加除余片裏幅版",
  ..."章毒殺責逃暴恐緊張破割別離印象与齢籍際遊",
  ..."誘勧寄迷占周囲協互共我皆緒援精抱氏尊敬申",
  ..."参致御湾沖浜江層砂泉源浮沈井沢宇宙環境極",
  ..."昇災害震防影響講義導専限修述将博策詩基条",
  ..."令司制省庁警察署捕乱党民挙委権票攻撃爆討",
  ..."射武畳床軒玄壁廊寮隣敷狭荘封筒歳暮宛菓詰",
  ..."瓶粒酢糖辛渋滞街往距灯携即稼需拒厳刷枠縦",
];

/** Fixed N2 learning order, second part (ranks 1021-1200, 9 pages of 20). */
export const N2_ORDER_2 = [
  ..."斜端隅堅硬鋭鈍詳簡潔頑勇賢偉珍肌粧髪脚華",
  ..."鏡帽傘革靴柄装睡眠喫煙脂肪妊娠双誕脈拍看",
  ..."患視眼舌刺菌咲枯散飾菊枝紺紫紅灰鮮彩飼畜",
  ..."猫羊豚巣放牧滝沼滴凍瀬浄掘埋泥炭鉱銅穴洞",
  ..."殴叫怖嫌憎恥誤謝励冗握絶宴催渇酌泡吐騒延",
  ..."超更徹憶僕僚輩誰偶孫祖似召拝了承伺頂被壊",
  ..."傾噴炎洪津波荒激吹乾燥湿涼雷嵐俳句詞覧簿",
  ..."塾像殿坊跡祈刑罰盗捜裁統衆秩序閣批敵砲領",
  ..."侵銃核護衛盟隊阪埼栃茨梨群鹿奈媛阜岡崎丘",
];

/**
 * N1 pages from the source screens. Ranks 1201-1340 (7 pages) and 1361-1380
 * (the 9th page); page 8 (1341-1360) is N1_PAGE_8.
 */
export const N1_ORDER_A = [
  ..."丁塚訓為扱披抑抵抗掲拭跳躍踏駆伏弾裂塗叱",
  ..."黙唱聴眺隠添排挑操磨奪妨遮伴尽諦誓悟避耐",
  ..."焦慌尋促惑譲陥迫遂抽覆偽輝控砕削挟挿及紛",
  ..."丈且丙串乏牙乙乞亜享亭哀仁仙伎仰伐伯但佐",
  ..."佳侍侮併侯俊俗侶俵俸俺倣倫倹偏偵僅傍傑僧",
  ..."傲儀儒償舎倉舗克免典丹冠冥冶凄准凝凡凶凸",
  ..."凹刀刃刈刹剖剛剤剣剥剰創劣功劾勅勃勘勲勾",
];
// 喩 is the standard form of the 喻 shown in the screen (喻 is not in the kanji dataset).
export const N1_ORDER_B = [..."唆唄哺唾喝唯喚喉喩嗅嘆嘲嘱嚇嗣吉哲唇啓囚"];

/** N1 page 8 (ranks 1341-1360). */
export const N1_PAGE_8 = [..."匂卓卑却卸厄厘又叔叙匠匿后吏呈呂呉吟呪咽"];

/** N1 pages 1381-1560 (9 pages of 20). */
export const N1_ORDER_C = [
  ..."圏坑坪垣培堀堆塀堤堪塔塊填墳壇壌垂堕塁墓",
  ..."塑塞墨墜墾執士壮壱奇奔奮奉奏泰奨妄妥婆威",
  ..."奴如妃妙妖妬姻姫娯婿媒嫉嫁嫡嬢孔孤孝宜宣",
  ..."宰宵密寂寛寡寧審寸寿尉尚尺尼尻尾尿屈属履",
  ..."屯岳崇崩崖岐岬峠峡峰巡巧己巾帆帥帝幕幣幹",
  ..."幻幽幾唐庶庸廃廉廷升弁弄弊弐弓弔弥弦弧彙",
  ..."彫彰径征徐循微徴徳怪恨恒悔悦悼惜惨惧惰愉",
  ..."慎慨慄慢憤憧憬憾懐扶抄択把抹拐拉拓拘拙拠",
  ..."括拷拶挨挫捉捗措描据捻推提揮搭揚揺搬搾摂",
];

/** N1 pages 1561-1620 (3 pages of 20). */
export const N1_ORDER_D = [
  ..."摘撤撮撲擁擦擬氾汎没汽沙汰沃沸泌沿派浦浪",
  ..."浸渉淑淡涯渓淫渦湧滋滅滑溝漠溺漬漂漆漏漫",
  ..."漸潮潜潤澄潟潰濁濫狂狙狩猛猟猶猿獄獲芋芝",
];

/** N1 pages 1621-1680 (3 pages of 20). */
export const N1_ORDER_E = [
  ..."芯芳芽苗茂茎苛葛萎葬藤蒸蓄蓋蔑蔽薦薪薫藩",
  ..."藍藻迅迭透逐逓逝逮逸遇遍遣遡遜遭遺遵遷還",
  ..."那邦邪邸郊郎郡郷郭阻附陣陛陪陰陳陵陶隆随",
];

/** N1 pages 1681-1800 (6 pages of 20). */
export const N1_ORDER_F = [
  ..."隙隔障志忌忍忠怠怨恩恣悠愁愚慈慮慰憂慶憲",
  ..."憩懇懲懸恭慕戒戚戯戴房扇扉拳掌摩摯故敏敢",
  ..."斑斗斤斥施旋旗旦旬旨昆是昌曹曽晶暦暫曇旺",
  ..."昧暁暇曖朗肖脅脊腎膚肘肝肢股肥肺胎胞胆朕",
  ..."胴脇腸腫腺膜膝膳膨臆朱采染某架桑棄栽朴朽",
  ..."析枢枕柿柵柳桃栓桁桟梗棋棺棚棟椎椅楷楼概",
];

/** N1 pages 1801-1920 (6 pages of 20). */
export const N1_ORDER_G = [
  ..."模槽樹欄欺款歓殉殊殖殻毀炊炉煩烈煮煎熊熟",
  ..."爪爵爽牲犠献獣玩珠班瑠璃琴璧璽瓦甚甲畏畔",
  ..."畝畿疎疫疾痕痩痘痢痴瘍癖癒皇盆監盤盲盾眉",
  ..."督睦瞳瞭瞬矛矢矯碁硝硫磁碑礁礎祉祥禍禅秀",
  ..."穀秘租称稚稲稿穂稽穏穫窃窒窟窮窯既罷罵羅",
  ..."袖裕裸褐裾襟笛箇箋箸範篤籠粋粗粘糧系素索",
];

/** N1 pages 1921-2040 (6 pages of 20). */
export const N1_ORDER_H = [
  ..."累繁紀糾紋紡紳絞継絹維綱網綻縄締縁緩縫緯",
  ..."縛緻繊繕織繰繭羞羨翁翼翻耕耗聖粛腐臭至臼",
  ..."興舶舷艇艦艶虎虐虚虜虞蚕蛍蛮蜜虹蚊蛇蜂衝",
  ..."衡喪衷衰褒襲覇臨訂訃託訟訴詐詔詠該誇詮詣",
  ..."誠諸請諾謁謎諧諭諮謀謡謙謹譜誉謄豪貌貞貢",
  ..."貪貫貴賀賓貼賂賊賄賭賜賠賦赦赴趣践踊踪蹴",
];

/** N1 final pages 2041-2136 (4 full pages + 16 chars). */
// 4th char of rank 2061 page: 頬 (頼 is already N2 #… 依頼); 頬 is the Jōyō kanji missing otherwise.
export const N1_ORDER_I = [
  ..."軌斬載軸轄辣辱酎酬酪酸酵酷醒醜醸釈釜釣鉢",
  ..."鈴鉛銘銭鋳鋼錠錯錬錦錮鍵鍋鍛鎌鎖鎮鐘鑑麺",
  ..."閑閥閲闇闘隷隻雄雅雌雰零霊霜霧露韓韻頃須",
  ..."項頌頓頬頻顎顕顧飢飽餌餅餓斉斎駄駒騎騰驚",
  ..."鬱鬼魂魅魔竜鯨骸髄鶏鶴麻亀鼓麓麗",
];

/** Fixed blocks: each list occupies consecutive ranks from `start`. */
export const PINNED_BLOCKS = [
  { start: 1, chars: N5_ORDER },
  { start: 121, chars: N4_ORDER },
  { start: 321, chars: N3_ORDER.slice(0, 100) },
  { start: 421, chars: N3_PAGE_6 },
  // Page order as confirmed by the user: 笑…列, 祝…久, 達…師 (source pages 7, 8, 6).
  { start: 441, chars: N3_ORDER.slice(120, 140) },
  { start: 461, chars: N3_ORDER.slice(140, 160) },
  { start: 481, chars: N3_ORDER.slice(100, 120) },
  { start: 501, chars: N3_ORDER.slice(160) },
  { start: 721, chars: N2_ORDER },
  { start: 1021, chars: N2_ORDER_2 },
  { start: 1201, chars: N1_ORDER_A },
  { start: 1341, chars: N1_PAGE_8 },
  { start: 1361, chars: N1_ORDER_B },
  { start: 1381, chars: N1_ORDER_C },
  { start: 1561, chars: N1_ORDER_D },
  { start: 1621, chars: N1_ORDER_E },
  { start: 1681, chars: N1_ORDER_F },
  { start: 1801, chars: N1_ORDER_G },
  { start: 1921, chars: N1_ORDER_H },
  { start: 2041, chars: N1_ORDER_I },
];
export const PINNED_ORDER = PINNED_BLOCKS.flatMap((b) => b.chars);

/**
 * Rank every char (Map char → 1-based rank). Chars in PINNED_BLOCKS get their
 * fixed rank; every other char fills the remaining ranks ascending, ordered by
 * JLPT N5→N1 tag, newspaper frequency, then fewer strokes.
 */
export function rankJoyo(chars, data) {
  const present = new Set(chars);
  const ranks = new Map();
  const used = new Set();
  for (const { start, chars: list } of PINNED_BLOCKS) {
    list.forEach((c, i) => {
      if (present.has(c) && !ranks.has(c)) {
        ranks.set(c, start + i);
        used.add(start + i);
      }
    });
  }
  const key = (c) => {
    const r = data[c] ?? {};
    return [r.jlpt_new ? 6 - r.jlpt_new : 9, r.freq ?? 99999, r.strokes ?? 99];
  };
  const rest = [...present]
    .filter((c) => !ranks.has(c))
    .sort((a, b) => {
      const ka = key(a), kb = key(b);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || a.codePointAt(0) - b.codePointAt(0);
    });
  let next = 1;
  for (const c of rest) {
    while (used.has(next)) next++;
    ranks.set(c, next++);
  }
  return ranks;
}
