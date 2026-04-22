import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import { claude } from "../api";

// ── 35 Types ─────────────────────────────────────────────────────────────────
const TYPES = [
  "Beauty > Skincare","Beauty > Hair Care","Beauty > Body Care","Beauty > Mask Packs",
  "Beauty > Sun Care","Beauty > Fragrance",
  "Korean Food > Kimchi","Korean Food > Ramen & Noodles","Korean Food > Fresh Produce",
  "Korean Food > Snacks & Chips","Korean Food > Bread & Bakery","Korean Food > Banchan",
  "Korean Food > Sauces & Condiments","Korean Food > Health & Supplements","Korean Food > Packaged Foods",
  "Fashion > Accessories",
  "Sports & Outdoors > Exercise & Fitness","Sports & Outdoors > Golf",
  "Sports & Outdoors > Swimming","Sports & Outdoors > Outdoor & Camping",
  "Home & Living > Household Supplies","Home & Living > Kitchenware","Home & Living > Home & Interior",
  "Baby & Kids > Baby Care","Baby & Kids > Toys & Games",
  "Stationery & Office","Automotive","Flowers & Gifts","Pet Supplies","$1 Bakery","Other",
];

// ── Rule-based classifier (우선순위 가이드 기준) ──────────────────────────────
// 순서: 떡볶이 → Snacks/Packaged → Bakery → Health → Sauces → Fresh → Beauty → 기타
const RULES = [
  // ── 최우선 1: 생활용품 (뷰티/식품 키워드와 혼동 방지) ─────────────────
  { type:"Home & Living > Household Supplies",
    rx:/\bdetergent\b|laundry detergent|washing machine cleaner|fabric softener|capsule detergent|dish soap(?!.*beauty)|zipper bag|dishwashing|dr\.?\s*beckmann|snuggle|\bdowny\b|세탁세제|세탁조세제|섬유유연제|\btoothbrush\b|\btoothpaste\b|\bdental\b|mouthwash|dental floss|\boral.?b\b|yusimol|median|치약|칫솔|구강청결제|가글|치실/i },
  { type:"Beauty > Body Care",
    rx:/body wash|body lotion|body scrub|body oil|body butter|hand cream|hand lotion|hand wash|바디워시|바디로션|바디스크럽|핸드크림|핸드로션/i },
  { type:"Home & Living > Kitchenware",
    rx:/\bscrubber\b|scouring pad|ziploc|dish cloth|\bgloves?\b(?!.*beauty|.*hand cream)|지퍼백|수세미/i },

  // ── 최우선 2: 식용 기름/양념 (헤어오일보다 먼저) ──────────────────────
  { type:"Korean Food > Sauces & Condiments",
    rx:/sesame oil|perilla oil|참기름|들기름|\bsalt\b(?!.*hair|.*beauty|.*scrub|.*body)|소금(?!.*bath|.*body)/i },

  // ── 최우선 3: 꽃/선물 (soap 단독 세정제 오염 방지) ───────────────────
  { type:"Flowers & Gifts",
    rx:/soap flower|비누꽃|preserved flower|\bbouquet\b|꽃다발|peony.*(?:bouquet|flower|gift)|rose.*bouquet|조화|프리저브드/i },

  // ── 뷰티 최우선 차단 ──────────────────────────────────────────────────
  // 염색약/헤어컬러 — 스킨케어로 빠지기 전에 먼저 잡음
  { type:"Beauty > Hair Care",
    rx:/hair wax|hair gel|hair spray|hair pomade|hair gloss|hair mask|hair pack|hair serum|hair oil|hair essence|hair mist|hair tonic|styling.*wax|styling.*gel|strong hold.*spray|hair dye|hair color|hair colouring|color cream|bleach|염색약|염모제|탈색제|새치염색/i },
  // 쿠션파운데이션 — 방석 쿠션과 분리
  { type:"Beauty > Skincare",
    rx:/cushion foundation|쿠션 파운데이션|bb cushion|cc cushion|makeup cushion|sun cushion|air cushion/i },
  // Kitchenware — Sauces보다 먼저
  { type:"Home & Living > Kitchenware",
    rx:/grinder|pepper mill|salt grinder|chopper|peeler|slicer|kitchen tool|utensil|garlic press|다지기|채칼/i },

  // ── Korean Food ───────────────────────────────────────────────────────
  { type:"Korean Food > Kimchi",
    rx:/kimchi|kimchee|김치|깍두기|kkakdugi|총각김치|열무김치|동치미|백김치/i },
  { type:"Korean Food > Banchan",
    rx:/banchan|반찬|namul|나물|muchim|무침|jorim|조림|장아찌|멸치볶음|콩자반|오징어채볶음|깻잎장아찌|깻잎무침|젓갈|dried radish|무말랭이|cheonggukjang|청국장|dried rapeseed|rapeseed greens|wild greens|건나물|건조나물/i },

  // ⚠️ Ramen & Noodles — 가장 먼저 (별도 카테고리)
  { type:"Korean Food > Ramen & Noodles",
    rx:/ramen|라면|jjajang|짜장면|instant noodle|noodle meal|국수|udon|우동|냉면|naengmyeon|rice noodle|vermicelli|당면|쌀국수|컵라면|봉지라면|신라면|진라면|너구리|안성탕면|불닭|짜파게티/i },

  // ⚠️ 떡볶이 — Snacks보다 먼저
  { type:"Korean Food > Packaged Foods",
    rx:/tteokbokki|떡볶이|컵떡볶이|즉석떡볶이|\boat rice\b|\bgrain rice\b|mixed.*grain(?!.*bowl)|잡곡밥(?!.*즉석)/i },

  // ⚠️ Snacks — protein bar/energy bar 제거 (Health로 보냄)
  { type:"Korean Food > Snacks & Chips",
    rx:/chips|cracker|cookie|biscuit|candy|gummy|jelly candy|popcorn|snacks?|rice puff|snack puff|chocolate|초콜릿|콘칲|칩|과자|스낵|사탕|젤리(?!.*vitamin)|쿠키|비스킷|팝콘|강냉이|뻥튀기|나쵸|빼빼로|새우깡|꼬북칩|홈런볼|오징어집|꼬깔콘|프링글|누룽지칩|누룽지(?!.*죽)|누룽지과자|쌀과자|곡물과자|스낵바|roasted seaweed|seaweed snack|김스낵|lollipop|mixed nuts|nuts|almonds?|walnuts?|cereal|yukwa|유과|강정|fruit snack|honey snack|confectionery|nut mix|trail mix|haitai|orion|lotte(?!.*hotel)|crown(?!.*cork)|haetae|grilled.*seaweed|seasoned.*seaweed|gimtae|laver snack/i },

  // ⚠️ Packaged Foods = 식사/즉석조리용 (라면/국수류 제외 — Ramen & Noodles로)
  { type:"Korean Food > Packaged Foods",
    rx:/dumpling|만두|frozen meal|냉동식품|frozen(?!.*yogurt|.*fruit|.*berry)|냉동|porridge|죽|pumpkin porridge|호박죽|instant meal|즉석식품|ready.to.eat|즉석밥|햇반|cooked rice|instant rice|meal kit|밀키트|curry|카레|bibimbap|비빔밥|soup(?!.*base)|soup base|broth|육수|sundae|순대|pasta(?!.*sauce)|brown rice(?!.*snack)|multigrain rice|영양밥|잡곡밥|현미밥/i },

  // Bakery
  { type:"Korean Food > Bread & Bakery",
    rx:/bread|bakery|식빵|빵|크루아상|바게트|베이글|머핀|스콘|toast bread|sandwich bread|croissant|bagel|muffin|scone|roll cake|카스테라|pastry|danish|hotcake mix|pancake mix|cake mix|베이킹 믹스|sprinkles|topping sugar|decor sugar/i },

  // Health — protein bar 포함, energy bar 포함
  { type:"Korean Food > Health & Supplements",
    rx:/vitamin|비타민|probiotics|유산균|protein powder|protein\b(?!.*shampoo|.*conditioner|.*hair.*color|.*dye|.*hair.*treatment)|프로틴|단백질 파우더|protein bar|energy bar|granola bar|collagen(?!.*cream|.*serum|.*eye|.*foundation|.*mask|.*cleanser|.*lotion|.*toner|.*ampoule|.*mist|.*foam)|콜라겐(?!.*크림|.*세럼|.*아이|.*파운|.*마스크|.*클렌)|red ginseng|홍삼|omega\s*3?|오메가\s*3?|arginine|아르기닌|루테인|영양제|보충제|honey stick|honey jelly|홍삼스틱|건강젤리|health jelly|health supplement|diet supplement/i },

  // Sauces
  { type:"Korean Food > Sauces & Condiments",
    rx:/gochujang|고추장|doenjang|된장|soy sauce|간장|ssamjang|쌈장|fish sauce|anchovy sauce|tuna sauce|액젓|멸치액젓|까나리|vinegar|식초|sesame oil|참기름|perilla oil|들기름|salt|소금|pepper(?!.*spray|.*snack|.*chips)|후추|dressing|드레싱|oyster sauce|굴소스|다시다|국간장|양념장|mayonnaise|mayo|마요네즈|wasabi|와사비|hot sauce|핫소스|pasta sauce|marinade|마리네이드|양념소스|ketchup|케첩|mustard|겨자|steak sauce|maple syrup|syrup(?!.*snack|.*chips)|시럽|flavor enhancer|미원|chili oil|고추기름|chili sauce|bbq sauce|peanut butter|oil(?!.*snack)|식용유|cooking oil|canola oil|olive oil/i },

  // Fresh Produce — 진짜 신선식품만
  { type:"Korean Food > Fresh Produce",
    rx:/친환경|유기농|무농약|fresh vegetable|fresh fruit|fresh produce|야채|채소|과일|bean sprouts|mung bean sprouts|콩나물|숙주|깻잎|perilla leaf|치커리|상추|배추|오이|미나리|쑥갓|브로콜리|토마토|양파|마늘|애호박|zucchini|당근|carrot|감자(?!.*chip)|potato(?!.*chip|.*starch|.*flour)|고구마(?!.*chip|.*snack)|sweet potato(?!.*chip|.*snack)|fresh ginger|생강|wild thistle|곤드레|엉겅퀴|chives|쪽파|부추|leek|taro|mushroom(?!.*snack|.*chip)|버섯(?!.*스낵|.*칩)|tofu|두부|fresh\s+(?:apple|grape|orange|lemon|pear|blueberr|strawberr|melon|watermelon|mango)|GAP.*(?:berry|fruit|apple|grape)|chili pepper|chilli pepper|청양고추|고추(?!.*sauce|.*oil|.*paste)|kale|organic greens|grain mix|\bbarley\b(?!.*tea)|\bchestnut\b|군밤|잡곡(?!.*밥)|현미(?!.*밥|.*즉석)|frozen.*vegetable|frozen.*veg(?!.*sauce|.*stock)|mixed.*vegetable|vegetable.*mix(?!.*sauce)|mixed.*frozen.*veg|assorted.*vegetable|mixed.*veg.*pack/i },

  // ── Beauty ────────────────────────────────────────────────────────────
  { type:"Beauty > Sun Care",
    rx:/sunscreen|sun cream|sunblock|spf|uv protection|uv shield|선크림|선블록|자외선차단/i },
  // Mask Packs — pack 수량 단어 제거
  { type:"Beauty > Mask Packs",
    rx:/sheet mask|sleeping mask|clay mask|nose pack|modeling pack|마스크팩|시트마스크|슬리핑마스크|클레이마스크|코팩|모델링팩/i },
  // Hair Care — 강화 (염색/퍼퓸샴푸 포함)
  { type:"Beauty > Hair Care",
    rx:/hair shampoo|hair conditioner|hair mask|hair serum|hair treatment|hair oil|hair essence|hair mist|hair tonic|scalp tonic|hair loss|hair color|hair dye|bleach|perfume shampoo|perfume conditioner|염색약|염모제|탈색제|새치염색|퍼퓸 샴푸|샴푸(?!.*카|.*차량)|린스|컨디셔너|헤어 트리트먼트|헤어마스크|헤어오일|헤어에센스|두피|탈모|헤어/i },
  { type:"Beauty > Body Care",
    rx:/body wash|body lotion|body scrub|body oil|body butter|hand cream|hand lotion|hand wash|바디워시|바디로션|바디스크럽|핸드크림|핸드로션/i },
  // Perfume — shampoo/conditioner 제외
  { type:"Beauty > Fragrance",
    rx:/perfume(?!.*shampoo|.*conditioner|.*hair)|eau de parfum|eau de toilette|reed diffuser|cologne|body spray(?!.*hair)|fragrance mist(?!.*hair)|향수|퍼퓸|룸 디퓨저/i },
  // Skincare — all-in-one/cushion/waterproof 제거, mist 추가
  { type:"Beauty > Skincare",
    rx:/face cleanser|cleanser(?!.*powder|.*food)|foam cleanser|face toner|toner(?!.*food)|face serum|serum(?!.*hair|.*food)|gel lotion|겔로션|moisturizer(?!.*food)|facial cream(?!.*cake|.*food)|cream(?!.*body|.*cake|.*ice|.*pie|.*food|.*치즈|.*크림빵)|face lotion|ampoule(?!.*food)|facial essence(?!.*cooking|.*food)|essence(?!.*hair|.*cooking|.*food|.*vanilla|.*lemon|.*almond|.*mint|.*extract|.*oil|.*flavor|.*요리|.*식품|.*향신)|soothing pads?|진정패드|trouble pads?|acne pads?|lipstick|lip color|lip tint|lip gloss|eye shadow|eyeshadow|eyeliner|mascara|foundation(?!.*sauce)|primer(?!.*food)|concealer|pact|contour|shading|highlighter|blush|blusher|makeup|lip stick|bb cream|cc cream|tone up cream|skin care(?!.*hair|.*sunscreen)|facial mist|hydrating mist|soothing mist|thermal.*mist|dokdo|round lab|dalba|mediheal|skin1004|anua|torriden|tori.?dden|cosrx|innisfree|etude|laneige|sulwhasoo|huxley|dr\.bio|some by mi|klairs|axis.?y|dr\.jart|jungsaemmul|papa recipe|클렌저|폼클렌징|토너|앰플|세럼(?!.*헤어)|에센스(?!.*헤어|.*요리|.*식품)|수분크림|아이크림|비비크림|파운데이션|미스트(?!.*헤어|.*car)|립스틱|틴트|아이섀도|마스카라|컨실러/i },
  // Baby Care — 강화
  { type:"Baby & Kids > Baby Care",
    rx:/baby|infant|newborn|toddler|baby lotion|baby shampoo|baby wash|baby cream|baby oil|baby powder|baby wipe|baby toothpaste|baby toothbrush|floatie|infant formula|baby formula|follow.?up formula|stage\s*[123]\s+formula|newborn formula|milk powder(?!.*protein)|baby bib|burp cloth|baby bottle|baby nipple|pacifier|teether|baby swim|baby float|diaper|기저귀|아기로션|물티슈(?!.*일반)|젖병|분유|유아용|신생아|아기|베이비|아동용/i },
  { type:"Baby & Kids > Toys & Games", rx:/장난감|블록(?!.*수납)|퍼즐(?!.*성인)|보드게임|toy|building block|coloring book|step stool.*toddler|toddler.*step stool|toddler.*footrest|foam.*bat.*kids|soft.*bat.*kids/i },
  { type:"Pet Supplies",               rx:/hamster|\brabbit food\b|\bbird food\b|\bbird.*feed\b|guinea pig|dog food|cat food|dog treat|pet food|cat treat|강아지사료|고양이사료|반려동물|펫푸드|강아지간식/i },
  { type:"Stationery & Office",
    rx:/ballpoint pen|pencil|eraser|scissors|tape|notebook(?!.*laptop)|marker|stapler|refill(?!.*pack)|ink cartridge|pen refill|marker refill|watercolor|paintbrush|brush set|art supply|볼펜|연필|지우개|가위|테이프|노트(?!북 컴퓨터)|형광펜|포스트잇|크레용|크레파스|스테이플러|리필|잉크/i },
  { type:"Automotive",
    rx:/car air freshener|car diffuser|car shampoo|car wash|car wax|car neck pillow|car cup holder|car sunvisor|car seat|car drying|car hanging|car armrest|car towel|motorcycle|windshield|washer fluid|wiper|tire|vehicle|automotive|자동차|차량용|카샴푸|카워시|선바이저|오토바이/i },
  { type:"Fashion > Accessories",          rx:/가방|지갑|모자|벨트|액세서리|bag(?!.*tea)|sunglasses|안경|선글라스/i },
  { type:"Sports & Outdoors > Golf",                  rx:/golf|골프/i },
  { type:"Sports & Outdoors > Swimming",              rx:/수경|킥판|수영모|swim goggles|kickboard|swim cap/i },
  { type:"Sports & Outdoors > Outdoor & Camping",     rx:/텐트|침낭|캠핑|랜턴(?!.*무드)|camping|sleeping bag/i },
  { type:"Sports & Outdoors > Exercise & Fitness",    rx:/dumbbell|yoga mat|resistance band|pilates|덤벨|요가|필라테스|운동밴드|폼롤러/i },
  { type:"Home & Living > Kitchenware",
    rx:/\bspatula\b|\bscraper\b(?!.*ice|.*car)|flexible.*turner|cooking.*spatula|stainless.*whisk|\bladle\b|shaved ice bowl|oatmeal plate|dinner plate|frying pan|rice cooker|kitchen knife|chopsticks?\b|cutting board|\bpasta bowl\b|ceramic.*bowl|melamine.*bowl|\bceramic.*dish\b|tableware|냄비|프라이팬|도마|주방칼|밀폐용기|락앤락|주전자|젓가락|강판|그라인더|그릇\b/i },
  { type:"Home & Living > Household Supplies",
    rx:/laundry detergent|dish soap|toilet paper|trash can|waste bin|tissue|wet wipe(?!.*car)|floor mat|bath mat|doormat|non-slip|sealant|cable tie|cleaner|세제(?!.*헤어)|섬유유연제|주방세제|화장지|청소포|탈취|쓰레기통|휴지통|매트/i },
  // Home Interior — seat cushion/방석 추가
  { type:"Home & Living > Home & Interior",
    rx:/인테리어|가구|seat cushion|chair cushion|sofa cushion|방석|소파 쿠션|의자 쿠션|쿠션 커버|수납|담요|홈데코|blind|roller screen|artificial tree|stool|shoe horn|organizer|storage box|hook|hanger(?!.*clothes)|걸이|행거/i },
  { type:"Flowers & Gifts",  rx:/비누꽃|조화|프리저브드|soap flower|꽃다발|\bbouquet\b|선물세트|gift set|peony|preserved flower|flower.*arrangement|arrangement.*flower/i },
  { type:"$1 Bakery",        rx:/\$1.*bakery|\$1.*korea|1달러.*베이커리/i },
];


const FOOD_W = /(\d+(?:\.\d+)?)\s*(g|ml)\s*[,，x×*]\s*(\d+)\s*(개|팩|봉|캔|병|박스|세트)?/i;

// ── 절대 우선 차단 (카테고리 오염 방지) ─────────────────────────────────────
// ── 차단 룰 ─────────────────────────────────────────────────────────────────
const BLOCK_RULES = [
  { block:"Beauty > Skincare",
    rx:/\bsauce\b|\bfood\b|ramen|snack|cake(?!.*face|.*pack)|pie\b|bread|kimchi|\bsoup\b|\bstock\b(?!.*ings)|cooking|baking|seasoning|detergent|laundry|kitchen|utensil|toothbrush|toothpaste|\bdental\b|body cream|body lotion|body wash|hand cream|\bshampoo\b|\bconditioner\b|correction tape|pen pouch|cabin filter/i },
  { block:"Korean Food > Fresh Produce",
    rx:/chips|snack|jelly|porridge|cake|pie|cookie|cracker|\bdrink\b|\bjuice\b(?!.*lemon)|roasted|dried(?!.*herb)|frozen(?!.*vegetable|.*veggie|.*veg\b)|instant|\bpowder\b|\bblend\b|ready.to.eat|fried rice|rice ball|볶음밥/i },
  // Packaged Foods에서 그릇/식기/차 차단
  { block:"Korean Food > Packaged Foods",
    rx:/\bbowl\b(?!.*soup|.*rice|.*porridge)|pasta bowl|ceramic.*dish|melamine.*bowl|soup bowl(?!.*soup mix)|\btea\b(?!.*bag.*soup|.*base)|barley tea|corn tea|green tea|herbal tea/i },
  { block:"Korean Food > Sauces & Condiments",
    rx:/grinder|cutter|chopper|tool|utensil|machine|device|maker/i },
  { block:"Korean Food > Health & Supplements",
    rx:/capsule detergent|laundry capsule|detergent.*capsule|capsule.*laundry|fabric.*capsule|세탁.*캡슐|캡슐.*세탁|세제.*캡슐|fabric softener/i },
  // oil 키워드가 있어도 헤어/스킨케어/보충제면 Sauces 차단
  { block:"Korean Food > Sauces & Condiments",
    rx:/hair oil|cleansing oil|body oil|oil-free|oil free|oil-in|argan oil|baobab oil|mct oil|hemp.*oil|fish oil(?!.*sauce)|krill oil|softgel|capsule(?!.*detergent)|oil.*hair|oil.*essence.*hair|oil.*serum|marker|pen|stationery|detergent|lotion|moisturi/i },
];

function isBlocked(type, text) {
  return BLOCK_RULES.some(b => b.block === type && b.rx.test(text));
}

// cushion 분기: 화장품 쿠션 vs 방석 쿠션
function classifyCushion(text="") {
  const t = text.toLowerCase();
  if (!/\bcushion\b|쿠션/.test(t)) return null;
  if (/foundation|\bbb\b|\bcc\b|makeup|cover|concealer|팩트|파운데이션|메이크업|sun cushion|air cushion/.test(t))
    return "Beauty > Skincare";
  if (/seat|sofa|chair|pillow|방석|의자|소파|쿠션커버|쿠션 커버/.test(t))
    return "Home & Living > Home & Interior";
  return null;
}

// mask pack vs 수량 pack 구분
function isMaskPackText(text="") {
  const t = text.toLowerCase();
  if (/\b\d+\s*pack\b|\bpack of \d+\b|\b\d+\s*packs\b|\b\d+\s*개입\b/.test(t)) return false;
  return /sheet mask|mask pack|sleeping mask|clay mask|nose pack|modeling pack|마스크팩|시트마스크/i.test(t);
}

function ruleClassify(title="", tags="") {
  const text = `${title} ${tags}`.trim();
  const lower = text.toLowerCase();

  // 0-0. 명확한 충돌 케이스 먼저 해결

  // ══ 스킨케어 오염 차단 (가장 먼저 실행) ══════════════════════════════════════
  // ① 칫솔/치약/구강 → Household (Skincare 진입 전 차단)
  if (/toothbrush|toothpaste|mouthwash|whitening gel|whitening.*gel|dental|oral.?b|구강|치약|칫솔/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-block-oral" };
  }
  // ② body cream/lotion/wash / hand cream → Body Care
  if (/body cream|body lotion|body wash|body butter|hand cream|hand lotion|바디 크림|핸드크림/i.test(lower)) {
    return { type: "Beauty > Body Care", src: "rule-block-body" };
  }
  // ③ shampoo/conditioner/scalp → Hair Care
  if (/\bshampoo\b|\bconditioner\b|hair.*treatment|hair.*repair.*conditioner|scalp.*care|scalp.*tonic|scalp.*rinse/i.test(lower) && !/carpet|fabric|laundry/i.test(lower)) {
    return { type: "Beauty > Hair Care", src: "rule-block-hair" };
  }
  // ④ 식품류 → 해당 카테고리
  if (/\blettuce\b|romaine|amaranth greens|butterhead|salad.*greens/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-block-produce" };
  }
  if (/\bradish\b|\bmu radish\b|daikon|\bwinter radish\b|\bjeju radish\b/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-radish" };
  }
  if (/\btangerine\b|\bkyultam\b|jeju.*orange|mandarin.*orange(?!.*flavor)|fresh.*citrus/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-citrus" };
  }
  if (/\bmango\b(?!.*tea|.*flavor|.*juice)|\bwatermelon\b|\bpineapple\b(?!.*flavor|.*juice)/i.test(lower) && !/candy|gummy|jam/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-tropical-fruit" };
  }
  if (/garlic scape|garlic shoot|frozen.*garlic(?!.*sauce|.*powder)|fresh.*garlic clove/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-garlic-fresh" };
  }
  if (/\bmussel meat\b|fresh.*mussel|\bsalmon fillet\b|\bscallop.*adductor\b|frozen.*salmon fillet|frozen.*scallop|fresh.*seafood/i.test(lower) && !/flavor|taste/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-fresh-seafood" };
  }
  if (/\bfava bean\b|\bred lentil\b|\blupin bean\b|\blentil\b(?!.*protein bar|.*supplement)/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-legumes" };
  }
  if (/dried.*wild vegetable|wild.*herb(?!.*supplement)|fresh.*wild vegetable|frozen.*spinach|frozen.*minced.*spinach/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-wild-veg" };
  }
  if (/banana.*milk|flavored.*milk|cantata.*coffee|cold brew coffee/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-block-food-drink" };
  }
  if (/tomato stew|beef goulash|beef.*stew/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-block-stew" };
  }
  // ⑤ 차량용품 → Automotive
  if (/\bcar\b.*(?:charm|start|button|filter|cabin|visor|mirror|ornament|figurine)/i.test(lower)) {
    return { type: "Automotive", src: "rule-block-car" };
  }
  if (/cabin filter|car air.*filter|activated.*carbon.*car/i.test(lower)) {
    return { type: "Automotive", src: "rule-block-car-filter" };
  }
  // ⑥ 문구류 → Stationery
  if (/correction tape|\bpen pouch\b|pen.*tray|origami.*paper|mechanical compass|\bbookmark\b(?!.*face|.*skin)/i.test(lower)) {
    return { type: "Stationery & Office", src: "rule-block-stationery" };
  }
  // ════════════════════════════════════════════════════════════════════════════

  // ① all-in-one + 세제/세탁 → Household (Skincare 오염 방지 최우선)
  if (/all.in.one/i.test(lower) && /detergent|laundry|capsule.*wash|fabric|세제|세탁/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-aio-detergent" };
  }
  // ② all-in-one + 주방도구/슬라이서 → Kitchenware
  if (/all.in.one/i.test(lower) && /slicer|chopper|mandoline|kitchen.*tool|주방/i.test(lower)) {
    return { type: "Home & Living > Kitchenware", src: "rule-aio-kitchen" };
  }
  // ③ all-in-one + 문구/stationery → Stationery
  if (/all.in.one/i.test(lower) && /pencil|stationery|pen.*set|문구/i.test(lower)) {
    return { type: "Stationery & Office", src: "rule-aio-stationery" };
  }
  // ④ all-in-one + 골프/스포츠 → Sports
  if (/all.in.one/i.test(lower) && /golf|pouch|bag.*sport|waterproof.*bag/i.test(lower)) {
    return { type: "Sports & Outdoors > Golf", src: "rule-aio-golf" };
  }
  // ⑤ all-in-one + 비타민/면역/건강보조 → Health
  if (/all.in.one/i.test(lower) && /vitamin|multivitamin|immune|supplement|tablet|capsule/i.test(lower) && !/detergent|laundry|fabric/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-aio-health" };
  }

  // ⑥ perfume + detergent/laundry/capsule세제 → Household (Fragrance 오염 방지)
  if (/perfume/i.test(lower) && /detergent|laundry|capsule.*clean|세제|세탁|fabric/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-perfume-detergent" };
  }
  // ⑦ perfume + shampoo/conditioner/hair → Hair Care
  if (/perfume/i.test(lower) && /shampoo|conditioner|\bhair\b/i.test(lower)) {
    return { type: "Beauty > Hair Care", src: "rule-perfume-hair" };
  }
  // ⑧ body mist → Fragrance (hair 제외)
  if (/\bbody mist\b/i.test(lower) && !/hair/i.test(lower)) {
    return { type: "Beauty > Fragrance", src: "rule-body-mist" };
  }

  // ⑨ BB cream / CC cream + SPF → Skincare (Sun Care 아님)
  if (/\bbb cream\b|\bcc cream\b/i.test(lower)) {
    return { type: "Beauty > Skincare", src: "rule-bb-cream" };
  }
  // ⑩ sunglasses / goggles → Accessories (Sun Care 아님)
  if (/sunglasses|\bgoggles\b|선글라스/i.test(lower)) {
    return { type: "Fashion > Accessories", src: "rule-sunglasses" };
  }

  // ⑬ sprouts → Fresh Produce 통일
  if (/bean sprouts|mung bean sprouts|soybean sprouts|콩나물|숙주|bean sprout/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-sprouts" };
  }
  // ⑭ rice ball / fried rice / 볶음밥 → Packaged Foods 통일
  if (/rice ball|\bfried rice\b|볶음밥|주먹밥|onigiri/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-rice-meal" };
  }
  // ⑮ fresh + frozen/dried/powder 조합이면 Fresh 아님 (BLOCK 보완)
  if (/\bfresh\b/i.test(lower) && /frozen|dried|powder|blend|ready.to.eat/i.test(lower)) {
    // fresh라도 가공이면 Fresh Produce 아님 → 계속 진행
  }
  // ⑯ dish/kitchen → Kitchenware 분기
  if (/\bdish\b(?!.*sauce|.*soap.*food)|kitchen gloves?|kitchen.*tool(?!.*food)/i.test(lower) && !/sauce|soap.*food/i.test(lower)) {
    if (/\bgloves?\b/i.test(lower)) return { type: "Home & Living > Kitchenware", src: "rule-kitchen-gloves" };
  }

  // ⑪ car + visor/mirror/dashboard → Automotive
  if (/\bcar\b|차량용/i.test(lower) && /visor|mirror|dashboard|suction/i.test(lower)) {
    return { type: "Automotive", src: "rule-car" };
  }
  // ⑫ instant noodle bowl (컵라면) → Ramen & Noodles
  if (/instant.*noodle.*bowl|noodle.*soup.*bowl|\bcup.*noodle\b/i.test(lower)) {
    return { type: "Korean Food > Ramen & Noodles", src: "rule-instant-noodle-bowl" };
  }
  // bowl / plate / tableware → Kitchenware
  if (/noodle.*bowl|ramen.*bowl|\bbowl set\b|bone china.*bowl|ceramic.*bowl|melamine.*bowl|\bsoup bowl\b|sectional.*plate|divided.*plate|\bplate set\b|\bceramic.*plate\b|\btableware\b/i.test(lower)) {
    return { type: "Home & Living > Kitchenware", src: "rule-bowl-plate" };
  }
  // scraper → Kitchenware
  if (/rotary scraper|\bscraper\b(?!.*skin|.*face)/i.test(lower)) {
    return { type: "Home & Living > Kitchenware", src: "rule-scraper" };
  }
  // driving gloves / car neck pillow / car vent → Automotive
  if (/driving gloves?|car neck pillow|neck pillow.*tesla|\bcar vent\b|\bcar.*organizer\b/i.test(lower)) {
    return { type: "Automotive", src: "rule-auto-extras" };
  }
  // bouquet + shampoo/hair → Hair Care (Flowers & Gifts 오염 방지)
  if (/bouquet/i.test(lower) && /shampoo|conditioner|\bhair\b|haircare/i.test(lower)) {
    return { type: "Beauty > Hair Care", src: "rule-bouquet-hair" };
  }
  // bouquet + body cream/lotion → Body Care
  if (/bouquet/i.test(lower) && /body cream|body lotion|body wash|바디/i.test(lower)) {
    return { type: "Beauty > Body Care", src: "rule-bouquet-body" };
  }
  // air freshener / febreze → Household Supplies
  if (/air freshener|febreze|\bodor eliminator\b|deodorizer(?!.*body)|fabric refresher/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-air-freshener" };
  }
  // mold remover / nano coating / cleaning spray → Household
  if (/mold remover|nano.*coat|nano.*clean|stain.*remover(?!.*laundry.*brand)|clorox|bleach(?!.*tooth|.*white)/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-cleaning" };
  }
  // bath towel / quilt cover (not sports towel) → Household
  if (/\bbath towel\b|\bquilt cover\b|\bquilt.*case\b|hotel.*towel|combed cotton.*towel/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-towel" };
  }
  // ── Soup 우선순위: Fresh Produce보다 먼저 잡아야 함 ─────────────────────────
  // instant soup / cream soup / cup soup / hangover soup → Packaged Foods
  if (/instant.*soup|cream.*soup|cup.*soup|hangover.*soup|freeze.dried.*soup|\bsoup\b.*mix|soup.*mix|\bmiso soup\b|egg.*soup|pollack.*soup|yukgaejang|freeze-dried.*soup block/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-soup-priority" };
  }
  // cream cup / microwave cup (Fontana/Bono 등) → Packaged Foods
  if (/\bcup soup\b|microwave.*soup|\bsoup cup\b|cream cup soup/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-cup-soup" };
  }
  // 냉장/냉동 육류 → Packaged Foods
  if (/(?:pork|duck|beef|chicken|lamb).*(?:cut|chilled|boneless|stew cut|stir.fry|refrigerated|frozen|marinated)/i.test(lower) && !/supplement|protein shake/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-meat-cut" };
  }
  if (/\bbulgogi\b|\bgalbi\b(?!.*tteok)|\bsamgyeopsal\b/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-korean-meat" };
  }
  // ─────────────────────────────────────────────────────────────────────────

  // jam / 잼 → Sauces & Condiments
  if (/\bjam\b|\b잼\b/i.test(lower) && !/\bram\b|\bslam\b/i.test(lower)) {
    return { type: "Korean Food > Sauces & Condiments", src: "rule-jam" };
  }
  // MSG / seasoning powder / furikake → Sauces & Condiments
  if (/\bmsg\b|monosodium glutamate|\bnucleotide.*season|\bfurikake\b|\bkatsuobushi.*season|seasoning powder|cooking.*seasoning|\bdoenjang\b|soybean paste|\ballulose\b|sugar substitute(?!.*supplement)|fruit.*concentrate(?!.*vitamin)/i.test(lower)) {
    return { type: "Korean Food > Sauces & Condiments", src: "rule-seasoning-ext" };
  }
  // car air filter / cabin filter → Automotive
  if (/car.*air.*filter|cabin.*filter|air.*conditioner.*filter/i.test(lower)) {
    return { type: "Automotive", src: "rule-car-filter" };
  }
  // car figurine / car ornament / car interior accessory → Automotive
  if (/car.*figurine|car.*ornament|car.*interior.*accessory|car.*decor|car.*doll/i.test(lower)) {
    return { type: "Automotive", src: "rule-car-ornament" };
  }
  // origami / OHP film / compass(drawing) → Stationery & Office
  if (/origami|\bohp film\b|\boverhead projector\b|mechanical compass|drawing compass/i.test(lower)) {
    return { type: "Stationery & Office", src: "rule-stationery-extra" };
  }
  // greeting card / patchwork card / message card → Stationery & Office
  if (/\bcard set\b(?!.*golf|.*game)|\bgreeting card\b|\bmessage card\b|\bpatchwork card\b/i.test(lower)) {
    return { type: "Stationery & Office", src: "rule-greeting-card" };
  }
  // curtain tieback / bathroom hook → Home & Interior
  if (/curtain tieback|curtain.*strap|\btieback\b/i.test(lower)) {
    return { type: "Home & Living > Home & Interior", src: "rule-curtain" };
  }
  // hair spray / hair gel / styling spray → Hair Care
  if (/\bhair spray\b|hair.*spray(?!.*room|.*fabric)|\bhair gel\b|\bhair wax\b|\bhair pomade\b|strong hold.*styling|freeze.*hair spray/i.test(lower)) {
    return { type: "Beauty > Hair Care", src: "rule-hair-styling" };
  }
  // sweat headband / athletic hairband → Sports > Exercise & Fitness
  if (/sweat.*headband|sweat.absorbing.*head|athletic.*hairband|moisture.wicking.*hairband/i.test(lower)) {
    return { type: "Sports & Outdoors > Exercise & Fitness", src: "rule-headband" };
  }
  // baseball hat / sun cap / bucket hat → Fashion > Accessories
  if (/\bbaseball hat\b|\bbaseball cap\b|\bsun cap\b|\bbucket hat\b|\bmesh cap\b|brim.*cap|brim.*hat/i.test(lower) && !/baby|kids|infant/i.test(lower)) {
    return { type: "Fashion > Accessories", src: "rule-hat" };
  }
  // beach towel / waterpark towel → Sports > Outdoor & Camping
  if (/\bbeach.*towel\b|\bwaterpark.*towel\b|disposable.*beach/i.test(lower)) {
    return { type: "Sports & Outdoors > Outdoor & Camping", src: "rule-beach-towel" };
  }
  // ride-on / walker / toddler → Baby > Toys & Games
  if (/ride.on car|\bwalker\b(?!.*walking|.*shoe)|toddler.*walker|puzzle mat.*kids|puzzle.*play mat/i.test(lower)) {
    return { type: "Baby & Kids > Toys & Games", src: "rule-baby-toys" };
  }
  // costume / dress-up / pretend play → Baby > Toys & Games
  if (/\bcostume\b(?!.*halloween.*adult)|dress.up|pretend play|role play.*outfit|role play.*kids/i.test(lower)) {
    return { type: "Baby & Kids > Toys & Games", src: "rule-costume" };
  }
  // foam bat / cloth book / sensory toy (kids) → Baby > Toys & Games
  if (/foam.*bat(?!.*cricket)|soft.*bat.*kids|cloth.*book(?!.*adult)|sensory.*book|fabric.*book.*baby|step stool.*toddler|toddler.*step stool/i.test(lower)) {
    return { type: "Baby & Kids > Toys & Games", src: "rule-baby-toy-ext" };
  }
  // inflatable tube / arm tube → Sports > Swimming
  if (/inflatable.*tube|ride.on.*inflatable|\bswim.*float\b|\bbaby.*float\b|inflatable.*arm|\barm tube\b|\bswim ring\b|swim.*ring/i.test(lower)) {
    return { type: "Sports & Outdoors > Swimming", src: "rule-inflatable" };
  }
  // banana milk / flavored milk drink → Packaged Foods
  if (/\bmilk\b.*(?:120ml|pack of \d+|mini.*pack|bottles)|banana.*milk|flavored.*milk/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-milk-drink" };
  }
  // granola cereal → Snacks & Chips
  if (/granola.*cereal|\bcereal\b(?!.*protein|.*supplement)/i.test(lower)) {
    return { type: "Korean Food > Snacks & Chips", src: "rule-cereal" };
  }
  // tteokbokki / rice cake spicy → Packaged (snack으로 빠지는 것 강제 차단)
  if (/tteokbokki|떡볶이|rice cake.*spicy|spicy.*rice cake|korean rice cake/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-tteok" };
  }
  // protein/collagen + cookie/jelly → Health (snack으로 빠지는 것 방지)
  if (/protein cookie|collagen jelly|protein jelly|collagen cookie|protein snack bar/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-health-snack" };
  }
  // cushion 분기 (air cushion, refill 포함)
  if (/\bcushion\b/i.test(lower)) {
    if (/foundation|\bbb\b|\bcc\b|refill|makeup|cover|concealer|tone.up|air cushion/i.test(lower))
      return { type: "Beauty > Skincare", src: "rule-cushion-beauty" };
    if (/seat|chair|sofa|pillow|방석|의자|소파/i.test(lower))
      return { type: "Home & Living > Home & Interior", src: "rule-cushion-home" };
  }
  // waterproof 단독 → Beauty 금지
  if (/waterproof/i.test(lower) && !/mascara|eyeliner|sun|foundation|sunscreen/i.test(lower)) {
    const wRescue = rescueClassify(title, tags);
    if (wRescue) return wRescue;
  }
  // dish/kitchen gloves → Kitchenware / cleaning/laundry gloves → Household
  if (/\bgloves?\b/i.test(lower)) {
    if (/dish|kitchen|주방/i.test(lower)) return { type: "Home & Living > Kitchenware", src: "rule-gloves" };
    if (/cleaning|laundry|세탁|청소/i.test(lower)) return { type: "Home & Living > Household Supplies", src: "rule-gloves" };
  }

  // 0-1. 뷰티 브랜드 — 다른 키워드보다 먼저 (오분류 90% 방지)
  if (/huxley|dr\.bio|some by mi|somebymi|\bklairs\b|axis.?y|dr\.jart|jungsaemmul|papa recipe|torriden|tori.?dden|round lab|roundlab|skin1004|\banua\b|\bcosrx\b|mediheal|\bdalba\b|innisfree|laneige|sulwhasoo|etude/i.test(text)) {
    // 브랜드 제품인데 Hair Care 키워드가 있으면 Hair Care
    if (/shampoo|conditioner|hair mask|scalp|샴푸|컨디셔너|헤어/i.test(text))
      return { type: "Beauty > Hair Care", src: "rule-brand-hair" };
    // Sun Care
    if (/\bspf\b|sunscreen|sun cream|sun stick/i.test(text))
      return { type: "Beauty > Sun Care", src: "rule-brand-sun" };
    return { type: "Beauty > Skincare", src: "rule-brand" };
  }

  // 0. Baby 먼저 (분유 등 milk powder가 food로 빠지는 문제 방지)
  if (/\bbaby\b|\binfant\b|\bnewborn\b|\btoddler\b|infant formula|baby formula|stage.{0,5}formula|stick formula|분유|아기|유아|신생아|베이비/.test(lower)) {
    return { type: "Baby & Kids > Baby Care", src: "rule-baby" };
  }

  // 1. 염색약 → Hair Care (Skincare 오염 방지)
  if (/hair dye|hair color|hair colouring|color cream|bleach|염색약|염모제|탈색제|새치염색/.test(lower)) {
    return { type: "Beauty > Hair Care", src: "rule-hair-dye" };
  }

  // 2. cushion 분기
  const cushionType = classifyCushion(text);
  if (cushionType) return { type: cushionType, src: "rule-cushion" };

  // 3. mask pack vs 수량 pack
  if (isMaskPackText(text)) return { type: "Beauty > Mask Packs", src: "rule-maskpack" };

  // 4. waterproof 단독은 Beauty 근거 아님
  if (/waterproof/.test(lower) && !/mascara|eyeliner|brow|foundation|cushion|sun cream|sunblock|sunscreen/.test(lower)) {
    return rescueClassify(title, tags) || null;
  }

  // 5. RULES 순회 + BLOCK_RULES 적용
  for (const rule of RULES) {
    if (rule.type === "Beauty > Mask Packs" && !isMaskPackText(text)) continue;
    if (rule.rx.test(text) && !isBlocked(rule.type, text)) {
      return { type: rule.type, src: "rule" };
    }
  }

  return null;
}

// ── 2차 Rescue Rules (Other 줄이기 전용) ────────────────────────────────────
const OTHER_RESCUE_RULES = [
  { type:"Korean Food > Ramen & Noodles",
    rx:/ramen|라면|noodle|우동|냉면|국수|쌀국수|당면|짜장면/i },
  { type:"Korean Food > Sauces & Condiments",
    rx:/teriyaki|tartare|dashida|다시다|\bstock\b(?!.*market)|bouillon|chipotle|yeondu|youndoo|worcestershire|hoisin|ponzu|mirin|미림|간장소스|양념간장|cooking sauce|dipping sauce|dippin/i },
  { type:"Beauty > Hair Care",
    rx:/shampoo|conditioner|treatment|hair mask|hair pack|hair dye|hair color|rinse|scalp shampoo|헤어팩|트리트먼트|컨디셔너|샴푸/i },
  { type:"Beauty > Skincare",
    rx:/mascara|foundation|primer|concealer|compact powder|\bpact\b|lip tint|\btint\b|makeup base|eye shadow|eyeshadow|palette|blusher|cleansing foam|cleansing oil|peeling gel|soothing gel|gel cream|\bpad\b|\bpatch\b|mask pack|팩|틴트|마스카라|파운데이션/i },
  { type:"Korean Food > Health & Supplements",
    rx:/capsule|tablet|softgel|supplement|probiotic|enzyme|\biron\b|\bzinc\b|\bomega\b|\bmsm\b|propolis|\bvitamin\b|콜라겐|영양제|캡슐|정\b/i },
  // Snacks fallback — 스낵바/에너지바/쌀과자/누룽지칩 포함
  { type:"Korean Food > Snacks & Chips",
    rx:/\bcracker\b|\bbiscuit\b|\bcookie\b|\bsnack\b|\bgum\b|chewing gum|캔디|과자|비스킷|스낵바|에너지바|쌀과자|누룽지칩/i },
  { type:"Home & Living > Household Supplies",
    rx:/detergent|laundry|fabric softener|scrubber|수세미|dish soap|toothbrush|toothpaste|dental|mouthwash|oral.?b|세탁|치약|칫솔|구강/i },
  { type:"Home & Living > Home & Interior",
    rx:/organizer|storage|hook|hanger|adhesive|curtain|rod|\brack\b|\bbasket\b|container|bathroom accessory|sink accessory|수납|정리함|걸이|행거/i },
  { type:"Automotive",
    rx:/visor|\bmirror\b|\bholder\b|\bclip\b|dashboard|cabin filter|air freshener|sunshade|차량용|자동차용|\bfilter\b/i },
  { type:"Beauty > Hair Care",
    rx:/hair dye|hair color|hair colouring|color cream|bleach|염색약|염모제|탈색제|새치염색|shampoo|conditioner|treatment|hair mask|rinse|헤어팩|트리트먼트|컨디셔너|샴푸/i },
  { type:"Beauty > Fragrance",
    rx:/\bperfume\b(?!.*shampoo|.*conditioner|.*hair)|eau de|\bcologne\b|\bbody mist\b(?!.*hair)|body spray(?!.*hair)|\bdiffuser\b|향수|퍼퓸/i },
  { type:"Baby & Kids > Baby Care",
    rx:/\bbaby\b|\binfant\b|\btoddler\b|infant formula|baby formula|stage.{0,5}formula|milk powder(?!.*protein)|diaper|baby bib|pacifier|teether|기저귀|아기|유아|분유|베이비|젖병/i },
  { type:"Home & Living > Home & Interior",
    rx:/seat cushion|chair cushion|sofa cushion|donut cushion|방석|소파 쿠션|의자 쿠션|쿠션 커버/i },
];

function rescueClassify(title="", tags="") {
  const text = `${title} ${tags}`.toLowerCase();
  for (const rule of OTHER_RESCUE_RULES) {
    if (rule.rx.test(text)) return { type: rule.type, src: "rescue" };
  }
  return null;
}

function estimateWeight(title) {
  const m = title.match(/(\d+(?:\.\d+)?)\s*(g|ml)\s*[,，x×*]\s*(\d+)/i);
  if (m) return (parseFloat(m[1]) * parseInt(m[3])) / 1000;
  const m2 = title.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
  if (m2) { const v=parseFloat(m2[1]), u=m2[2].toLowerCase(); return (u==="kg"||u==="l")?v:v/1000; }
  return null;
}

const DEF_W = { "Korean Food > Snacks & Chips":0.4,"Korean Food > Packaged Foods":0.8,"Korean Food > Fresh Produce":1.5,"Korean Food > Kimchi":1.0,"Korean Food > Health & Supplements":0.3,"Beauty > Skincare":0.4,"Beauty > Hair Care":0.5,"Home & Living > Kitchenware":1.0,"Pet Supplies":1.5 };

const BRAND_RULES = [
  { rx:/bibigo|bi\s*bi\s*go/i, tag:"Bibigo" },
  { rx:/black\s*[&and]*\s*white\s*chef/i, tag:"Black and White Chef" },
  { rx:/dr\.?\s*g\b/i, tag:"Dr.G" },
  { rx:/round\s*lab|roundlab/i, tag:"Round Lab" },
  { rx:/cosrx/i, tag:"COSRX" },
  { rx:/innisfree/i, tag:"Innisfree" },
  { rx:/laneige/i, tag:"Laneige" },
  { rx:/sulwhasoo/i, tag:"Sulwhasoo" },
  { rx:/etude/i, tag:"Etude" },
  { rx:/some\s*by\s*mi|somebymi/i, tag:"Some By Mi" },
  { rx:/skin1004/i, tag:"Skin1004" },
  { rx:/\banua\b/i, tag:"Anua" },
  { rx:/torriden/i, tag:"Torriden" },
];

function detectBrands(text) { return BRAND_RULES.filter(b=>b.rx.test(text)).map(b=>b.tag); }
function mergeTags(existing, newTags) {
  if (!newTags.length) return existing;
  const curr = existing ? existing.split(",").map(t=>t.trim()).filter(Boolean) : [];
  return [...new Set([...curr,...newTags])].join(", ");
}

// ── Category normalization (오타/변형 자동 교정) ──────────────────────────────
const ALLOWED_TYPES = new Set(TYPES);
const TYPE_NORMALIZE = {
  "Korean Food > Banchan (Side Dishes)": "Korean Food > Banchan",
  "Beauty > Skin Care": "Beauty > Skincare",
  "Beauty>Skincare": "Beauty > Skincare",
  "Korean Food > Sauce & Condiments": "Korean Food > Sauces & Condiments",
  "Korean Food > Snack & Chips": "Korean Food > Snacks & Chips",
  "Korean Food > Fresh produce": "Korean Food > Fresh Produce",
  "Life": "Other", "life": "Other",
  "Beauty > Fragrance": "Beauty > Fragrance",
  "Korean Food > Packaged Foods": "Korean Food > Packaged Foods",
  "Fashion > Women's Clothing": "Fashion > Accessories",
  "Fashion > Men's Clothing": "Fashion > Accessories",
  "Fashion > Kids Clothing": "Fashion > Accessories",
  "Fashion > Swimwear & Beachwear": "Fashion > Accessories",
  "Fashion > Shoes & Sandals": "Fashion > Accessories",
};

function normalizeType(t="") {
  const s = t.trim();
  return TYPE_NORMALIZE[s] || s;
}

// 광고성 문구 제거 + 90자 제한
function cleanTitle(t="") {
  let s = t.trim()
    // 대시 뒤에 오는 광고성 설명 전체 제거
    .replace(/\s*[-–—]\s*(premium|long.lasting|durable|authentic|natural|healthy|light and|fresh and|crisp and|sweet and|pure|refreshing|elegant|convenient|easy to use|perfect for|great for|suitable for|ideal for|compatible with|for everyday|for cooking|for health)[^,]*/gi, "")
    // 독립적인 promotional phrases
    .replace(/(?:^|\s)premium\s*/gi, " ")
    .replace(/\s*[-–—]\s*(?:for|perfect|great|easy|suitable|ideal).*$/gi, "")
    .replace(/(?:\s|^)perfect for .*$/gi, "")
    .replace(/(?:\s|^)great for .*$/gi, "")
    .replace(/(?:\s|^)easy to use.*$/gi, "")
    .replace(/(?:\s|^)for everyday use.*$/gi, "")
    .replace(/(?:\s|^)for cooking.*$/gi, "")
    .replace(/(?:\s|^)for health.*$/gi, "")
    .replace(/(?:\s|^)fresh and crisp.*$/gi, "")
    .replace(/(?:\s|^)high quality.*$/gi, "")
    .replace(/(?:\s|^)natural korean snack.*$/gi, "")
    .replace(/[–—]+/g, " - ")
    .replace(/\s+/g, " ").trim();
  s = s.replace(/\s*[-–—]\s*$/, "").trim();
  return s.length > 90 ? s.slice(0, 90).trim() : s;
}

// 검수 필요 카테고리
const REVIEW_TYPES = new Set(["Korean Food > Packaged Foods", "Other"]);

// AI 결과 후처리: type 보정 + title 정리 + life 차단
function postProcess(rawProduct, aiResult) {
  const sourceTitle = rawProduct?.title || "";
  const sourceTags  = rawProduct?.tags  || "";

  let finalType  = normalizeType(aiResult?.type || "");
  let finalTitle = cleanTitle(aiResult?.title_en || sourceTitle);
  const confidence = Number(aiResult?.confidence || 0);

  const strongRule = ruleClassify(sourceTitle, sourceTags);

  // 1) 허용 카테고리 아니면 rule → Other
  if (!ALLOWED_TYPES.has(finalType)) {
    finalType = strongRule?.type || "Other";
  }

  // 2) life 절대 차단
  if (!finalType || finalType.toLowerCase() === "life") {
    finalType = strongRule?.type || "Other";
  }

  // 3) AI 매우 불확실(< 0.60)할 때만 rule 덮어쓰기
  if (strongRule && confidence < 0.60) {
    finalType = strongRule.type;
  }

  // 4) AI가 Packaged Foods인데 rule이 더 구체적이면 보정
  if (strongRule && finalType === "Korean Food > Packaged Foods" && strongRule.type !== "Korean Food > Packaged Foods") {
    finalType = strongRule.type;
  }

  // 5) AI가 Other인데 rule 있으면 rule 사용
  if (strongRule && finalType === "Other") {
    finalType = strongRule.type;
  }

  // 6) title 너무 길거나 광고문이면 원본으로 복구
  if (finalTitle.length > 80 || /perfect for|great for|easy to use|for cooking|premium quality/i.test(finalTitle)) {
    finalTitle = cleanTitle(sourceTitle);
  }

  return {
    type: finalType,
    title_en: finalTitle,
    description: aiResult?.description || "",
    confidence,
    brandTags: Array.isArray(aiResult?.brandTags) ? aiResult.brandTags : [],
  };
}

// ── Option translation maps ───────────────────────────────────────────────────
const OPTION_NAME_MAP = {
  "색상":"Color","컬러":"Color","사이즈":"Size","크기":"Size","용량":"Volume",
  "중량":"Weight","맛":"Flavor","향":"Scent","종류":"Type","옵션":"Option",
  "수량":"Quantity","구성":"Set","재질":"Material","스타일":"Style","길이":"Length",
  "폭":"Width","높이":"Height","호수":"Size","신발사이즈":"Shoe Size",
};
const OPTION_VALUE_MAP = {
  // Colors
  "빨강":"Red","레드":"Red","검정":"Black","블랙":"Black","흰색":"White","화이트":"White",
  "파랑":"Blue","블루":"Blue","초록":"Green","그린":"Green","노랑":"Yellow","옐로우":"Yellow",
  "분홍":"Pink","핑크":"Pink","회색":"Gray","그레이":"Gray","갈색":"Brown","브라운":"Brown",
  "보라":"Purple","퍼플":"Purple","베이지":"Beige","네이비":"Navy","민트":"Mint","오렌지":"Orange",
  "하늘색":"Sky Blue","금색":"Gold","골드":"Gold","은색":"Silver","실버":"Silver",
  // Sizes
  "소":"Small","소형":"Small","중":"Medium","중형":"Medium","대":"Large","대형":"Large",
  "특대":"X-Large","특소":"X-Small","대용량":"Large Size","소용량":"Small Size",
  // Flavors
  "매운맛":"Spicy","순한맛":"Mild","오리지널":"Original","기본":"Basic","혼합":"Mixed",
  "달콤한":"Sweet","짭짤한":"Savory","새콤한":"Tangy",
  // Storage
  "냉동":"Frozen","냉장":"Chilled","실온":"Room Temperature",
  // Product types
  "본품":"Main Product","리필":"Refill","단품":"Single Item","세트":"Set","1+1":"Buy 1 Get 1",
  "증정품":"Gift Item","샘플":"Sample","패키지":"Package","선물세트":"Gift Set",
  // Misc
  "없음":"None","기타":"Other","선택":"Select",
};

function hasKorean(text="") { return /[가-힣]/.test(String(text)); }
function nws(text="") { return String(text).replace(/\s+/g," ").trim(); }

function translateOptName(name="") { return OPTION_NAME_MAP[nws(name)] || nws(name); }
// 단위 번역 (옵션값 전용)
const UNIT_MAP_OPT = {
  "정":"Tablet","캡슐":"Capsule","포":"Pouch","팩":"Pack",
  "병":"Bottle","캔":"Can","봉":"Bag","박스":"Box",
  "개":"Piece","세트":"Set","매":"Sheet","장":"Sheet","회분":"Serving",
};
const COLOR_KR_MAP = {
  "라이트베이지":"Light Beige","뉴트럴베이지":"Neutral Beige","내추럴베이지":"Natural Beige",
  "아이보리":"Ivory","베이지":"Beige","핑크베이지":"Pink Beige","쿨베이지":"Cool Beige",
  "웜베이지":"Warm Beige","샌드베이지":"Sand Beige","베어":"Bear","코튼":"Cotton",
  "라이트":"Light","내추럴":"Natural","뉴트럴":"Neutral","글로우":"Glow",
  "러블리":"Lovely","클리어":"Clear","쿨":"Cool","웜":"Warm",
};

function tuOpt(num, unit) {
  const en = UNIT_MAP_OPT[unit];
  if (!en) return num + unit;
  const n = parseInt(num, 10);
  return `${num} ${n > 1 ? en + "s" : en}`;
}

function translateOptVal(value="") {
  const c = nws(value);
  if (OPTION_VALUE_MAP[c]) return OPTION_VALUE_MAP[c];
  const t = c;
  let m;

  m = t.match(/^(\d+)세트$/);
  if (m) return m[1] + (parseInt(m[1])>1?" Sets":" Set");

  m = t.match(/^기저귀\s+(\d+)단계\s+(\d+)매$/);
  if (m) return `Diaper Size ${m[1]}, ${m[2]} Sheets`;

  m = t.match(/^기저귀\s+(신생아|소형|초소형)\s+(\d+)매$/);
  if (m) return `Diaper Newborn, ${m[2]} Sheets`;

  m = t.match(/^(\d+)단계\(조산아전용\)\s*[×x*]\s*(\d+)\s*개입?$/);
  if (m) return `Newborn Size (Preemie), ${m[2]} Pack${parseInt(m[2])>1?"s":""}`;

  m = t.match(/^(\d+)단계\s*[×x*]\s*(\d+)\s*매$/);
  if (m) return `Size ${m[1]}, ${m[2]} Sheets`;

  m = t.match(/^(\d+)단계$/);
  if (m) return `Size ${m[1]}`;

  m = t.match(/^(\d+)\s*매\s*[×x*]\s*(\d+)\s*개입?$/);
  if (m) return `${m[1]} Sheets, ${m[2]} Pack${parseInt(m[2])>1?"s":""}`;

  m = t.match(/^\(상\)\s*(.+)$/);
  if (m) return "(Grade A) " + translateOptVal(m[1]);

  m = t.match(/^(\d+(?:\.\d+)?(?:ml|g|kg|l|mg))\s*[×x*]\s*(\d+)\s*박스$/i);
  if (m) return `${m[1]}, ${m[2]} Box${parseInt(m[2])>1?"es":""}`;

  m = t.match(/^(\d+)\s*회분\s*[×x*]\s*(\d+)\s*박스$/);
  if (m) return `${m[1]} Servings, ${m[2]} Box${parseInt(m[2])>1?"es":""}`;

  m = t.match(/^(\d+(?:\.\d+)?(?:ml|g|kg|l|mg))\s*[×x*]\s*(\d+)\s*(봉|포|병|캔|팩)$/i);
  if (m) { const ue=UNIT_MAP_OPT[m[3]]||m[3]; const n=parseInt(m[2]); return `${m[1]}, ${m[2]} ${n>1?ue+"s":ue}`; }

  m = t.match(/^(\d+)\s*(정|캡슐|포)\s*[×x*]\s*(\d+)\s*개입?$/);
  if (m) return tuOpt(m[1],m[2]) + `, ${m[3]} Pack${parseInt(m[3])>1?"s":""}`;

  m = t.match(/^(\d{2})\s*([가-힣]+)\s*[×x*]\s*(\d+)\s*(개|세트)입?$/);
  if (m) { const enC=COLOR_KR_MAP[m[2]]||m[2]; const ue=UNIT_MAP_OPT[m[4]]||m[4]; const n=parseInt(m[3]); return `${m[1]} ${enC}, ${m[3]} ${n>1?ue+"s":ue}`; }

  m = t.match(/^(\d{2})\s+([가-힣]+)\s*[×x*]\s*(\d+)\s*세트$/);
  if (m) { const n=parseInt(m[3]); return `${m[1]} ${COLOR_KR_MAP[m[2]]||m[2]}, ${m[3]} Set${n>1?"s":""}`; }

  m = t.match(/^(\d+(?:\.\d+)?(?:ml|g|kg|l|mg))\s*[×x*]\s*(\d+)\s*개입?$/i);
  if (m) return `${m[1]}, ${m[2]} Pack${parseInt(m[2])>1?"s":""}`;

  m = t.match(/^(\d+)\s*(정|캡슐|포|병|캔|봉|박스|매|장)$/);
  if (m) return tuOpt(m[1],m[2]);

  m = t.match(/^(\d+)\s*개입$/);
  if (m) return m[1] + " Pack" + (parseInt(m[1])>1?"s":"");

  m = t.match(/^(\d+)\s*개$/);
  if (m) return m[1] + (parseInt(m[1])>1?" Pieces":" Piece");

  return c;
}
function dedupeArr(arr=[]) { return [...new Set(arr.map(v=>nws(v)).filter(Boolean))]; }

function sanitizeOptions(options=[]) {
  if(!Array.isArray(options)) return [];
  return options.map(opt=>{
    const name = translateOptName(opt?.name||"");
    const values = dedupeArr((opt?.values||[]).map(translateOptVal));
    return (name && values.length) ? {name, values} : null;
  }).filter(Boolean);
}
function sanitizeTags(tags=[]) {
  if(!Array.isArray(tags)) return [];
  return dedupeArr(tags.map(t=>{ const c=nws(t); return OPTION_VALUE_MAP[c]||c.toLowerCase(); }));
}

function postProcessEnglishData(aiResult) {
  const result = {
    title_en:      nws(aiResult?.title_en||""),
    description_en:nws(aiResult?.description_en||""),
    options:       sanitizeOptions(aiResult?.options||[]),
    tags_en:       sanitizeTags(aiResult?.tags_en||[]),
  };
  return { ...result, isEnglishOnly: ![result.title_en, result.description_en, ...result.tags_en, ...result.options.flatMap(o=>[o.name,...o.values])].some(hasKorean) };
}


const TRANS_PROMPT = `You are cleaning and standardizing Shopify product data for GuamPick.
Convert all Korean text into clear, natural English for an English-only e-commerce store.

Important:
- Output must be 100% English. No Korean characters anywhere.
- Do not invent facts. Keep the product meaning accurate.
- Keep titles short, clean, and product-like.
- Do NOT use: "perfect for", "great for", "premium quality", "easy to use", "for everyday use"

Tasks:
1. Title — short natural English. Keep brand, product name, flavor/type, size, count.
   Good: "Crown Corn Chips Roasted Corn Flavor 70g, 6 Packs"
   Bad: "Premium Fresh Corn Chips – Perfect for Snacking"

2. Description — 1-2 simple factual sentences. No hype.

3. Options — convert names and values to standard English. Remove duplicates.
   - "없음"→"None" | "선택"→"Select" | "기타"→"Other"
   Option names: 색상/컬러→Color | 사이즈/크기/호수→Size | 용량→Volume | 중량→Weight | 맛→Flavor | 향→Scent | 종류→Type | 수량→Quantity | 구성→Set | 재질→Material | 스타일→Style | 길이→Length | 신발사이즈→Shoe Size
   Option values: 빨강→Red | 검정→Black | 흰색→White | 파랑→Blue | 초록→Green | 노랑→Yellow | 분홍→Pink | 회색→Gray | 갈색→Brown | 보라→Purple | 소→Small | 중→Medium | 대→Large | 특대→X-Large | 1개→1 Piece | 2개→2 Pieces | 3개입→3 Pack | 6개입→6 Pack | 매운맛→Spicy | 순한맛→Mild | 오리지널→Original | 혼합→Mixed | 냉동→Frozen | 냉장→Chilled | 실온→Room Temperature

4. Tags — convert all to English, remove Korean, lowercase, no duplicates.

Return JSON only (no markdown):
{
  "title_en": "string",
  "description_en": "string",
  "options": [{"name":"string","values":["string"]}],
  "tags_en": ["string"]
}`;

// ── 한글 잔존 시 재시도용 간단 프롬프트 ─────────────────────────────────────
const RETRY_PROMPT = `The following product data still contains Korean characters. Convert ALL Korean to English.
Return JSON only: {"title_en":"...","description_en":"...","options":[{"name":"...","values":["..."]}],"tags_en":["..."]}
No Korean allowed in any field.`;

const AI_TYPE_PROMPT = `Classify this product into exactly ONE of these types. NEVER output "life". Prefer conservative classification. Reply with ONLY the type name.

Key distinction - Korean Food > Snacks & Chips vs Korean Food > Packaged Foods:
- Snacks & Chips: ready-to-eat items (chips, crackers, cookies, candy, gummies, popcorn, rice snacks, nurungji chips, energy bars)
- Packaged Foods: meal or cooking-based items (ramen, dumplings, frozen food, instant rice, meal kits, porridge, curry, soup base)

Rules:
- Nurungji chips / nurungji snack → Snacks (NOT Packaged)
- Plain nurungji → Snacks (default safer)
- Dried seaweed / kim / miyeok → NOT Packaged (leave as Other if unsure)
- Herbal tea / barley tea / corn tea → NOT Packaged (Other or Beverage)
- Flour / powder / starch → NOT Packaged (ingredient, leave as Other)
- Pancake mix → NOT Packaged

${TYPES.join("\n")}`;


function normalizeKey(v="") {
  return String(v||"").trim().toLowerCase();
}

function makeVariantKey(handle, o1, o2, o3) {
  return [handle, o1, o2, o3].map(normalizeKey).join("__");
}
function _nt(text="") { return String(text).toLowerCase().replace(/\s+/g," ").trim(); }
function _addTag(s, t) { if(t) s.add(t); }

function detectTemp(title="", type="") {
  const t = _nt(`${title} ${type}`);
  if (/frozen|냉동/.test(t)) return "temp:frozen";
  if (/chilled|refrigerated|냉장/.test(t)) return "temp:chilled";
  if (/kimchi|김치/.test(t)) return "temp:chilled";
  return "temp:room";
}

function detectShip(weightKg=0, title="", type="") {
  const t = _nt(`${title} ${type}`);
  if (weightKg > 5 || /bulk|box\b|detergent|toilet paper|washer fluid/.test(t)) return "ship:avoid";
  if (weightKg > 3) return "ship:bulky";
  if (weightKg < 0.3) return "ship:super_light";
  if (weightKg <= 0.35) return "ship:light";
  if (weightKg <= 1.0)  return "ship:medium";
  if (weightKg <= 3.0)  return "ship:heavy";
  return "ship:bulky";
}

function detectTarget(title="", type="", tags="") {
  const t = _nt(`${title} ${type} ${tags}`);
  const out = [];
  if (/kimchi|김치|banchan|반찬|tteokbokki|bibigo|샘표/.test(t)) out.push("target:korean");
  if (/snack|chips|mayo|hot sauce|instant/.test(t)) out.push("target:filipino");
  if (/bulk|family pack|car |automotive/.test(t)) out.push("target:military");
  if (out.length === 0) out.push("target:general");
  return out;
}

function detectPriority(product) {
  const type  = product.newType || "";
  const title = _nt(product.titleEn || "");
  const w     = product.weightKg || 0;
  if (type === "Other") return "priority:low";
  if (["Korean Food > Snacks & Chips","Korean Food > Kimchi","Beauty > Skincare"].includes(type)) return "priority:hero";
  if (/ramen|라면|instant rice|햇반/.test(title)) return "priority:hero";
  if (w > 3) return "priority:low";
  return "priority:normal";
}

function detectCategoryDetail(type="") {
  if (type.includes("Kimchi"))    return ["food:kimchi"];
  if (type.includes("Banchan"))   return ["food:banchan"];
  if (type.includes("Sauces"))    return ["food:sauce"];
  if (type.includes("Snacks"))    return ["food:snack"];
  if (type.includes("Bakery"))    return ["food:bakery"];
  if (type.includes("Packaged"))  return ["food:instant"];
  if (type.includes("Skincare"))  return ["beauty:skincare"];
  if (type.includes("Hair"))      return ["beauty:hair"];
  return [];
}

function detectReview(product) {
  if (product.newType === "Other")        return "review:manual";
  if ((product.confidence || 0) < 0.6)   return "review:manual";
  if (hasKorean(product.titleEn || ""))   return "review:manual";
  return "review:auto";
}

// 판매 관련 태그 (매출 직결)
function detectSalesTags(product) {
  const t = _nt(product.titleEn || "");
  const tags = [];
  if (/ramen|라면/.test(t))            tags.push("best:ramen");
  if (/kimchi|김치/.test(t))           tags.push("best:kimchi");
  if (/snack|chips|cookie/.test(t))    tags.push("best:snack");
  if (/protein|diet|low.calorie/.test(t)) tags.push("trend:diet");
  if (/spicy/.test(t))                 tags.push("trend:spicy");
  if (/korean/.test(t))                tags.push("trend:kfood");
  if (/bulk|box|family/.test(t))       tags.push("buyer:family");
  return tags;
}

// 상품 가치 태그 (원본 태그/타입 기반 — cleanTitle이 premium 제거하므로)
function detectValue(product) {
  const type = product.newType || "";
  const tags = product.tags || "";
  // 원본 태그에 organic, premium 있으면
  if (/organic|유기농|친환경/.test(tags)) return "value:premium";
  if (/health|supplement|홍삼|red ginseng/.test(type)) return "value:premium";
  if (/\$1|1달러/.test(type)) return "value:budget";
  return "value:standard";
}

function generateOperationalTags(product) {
  const tags = new Set();
  _addTag(tags, detectTemp(product.titleEn, product.newType));
  _addTag(tags, detectShip(product.weightKg, product.titleEn, product.newType));
  _addTag(tags, detectPriority(product));
  _addTag(tags, detectReview(product));
  _addTag(tags, detectValue(product));
  detectTarget(product.titleEn, product.newType, product.tags).forEach(t => _addTag(tags, t));
  detectCategoryDetail(product.newType).forEach(t => _addTag(tags, t));
  detectSalesTags(product).forEach(t => _addTag(tags, t));
  return [...tags];
}

function calcShipping(kg) { return Math.ceil(Math.max(kg, 0.1)) * 3; }

// variant 행의 옵션값에서 수량 추출 (예: "3개입" → 3, "12 Pack" → 12)
function extractQtyFromOption(val="") {
  const s = String(val).trim().toLowerCase();

  let m = s.match(/[×x*]\s*(\d+)\s*개/);
  if (m) return parseInt(m[1], 10);

  m = s.match(/,\s*(\d+)\s*개/);
  if (m) return parseInt(m[1], 10);

  m = s.match(/(\d+)\s*개입/);
  if (m) return parseInt(m[1], 10);

  m = s.match(/(\d+)\s*(pack|packs|piece|pieces|set|sets)\b/);
  if (m) return parseInt(m[1], 10);

  m = s.match(/(?:pack|set|case|bundle)\s+of\s+(\d+)/);
  if (m) return parseInt(m[1], 10);

  m = s.match(/(\d+)\s*[- ]?count\b/);
  if (m) return parseInt(m[1], 10);

  m = s.match(/(\d+)\s*pk\b/);
  if (m) return parseInt(m[1], 10);

  m = s.match(/(\d+)\s*ea\b/);
  if (m) return parseInt(m[1], 10);

  m = s.match(/qty\s*(\d+)/);
  if (m) return parseInt(m[1], 10);

  m = s.match(/[x×]\s*(\d+)\b/);
  if (m) return parseInt(m[1], 10);

  return 1;
}

// variant 행 기준 무게 추정 (title 무게 × 옵션 수량)
function estimateVariantWeight(title="", opt1val="", opt2val="", opt3val="") {
  const opts = [opt1val, opt2val, opt3val].filter(Boolean);

  // 옵션값에서 수량 파악
  let maxQty = 1;
  for (const opt of opts) {
    const q = extractQtyFromOption(opt);
    if (q > maxQty) maxQty = q;
  }

  // title에서 "Xg × N개" 패턴 → 단위무게(g) × 옵션수량
  const mCount = title.match(/(\d+(?:\.\d+)?)\s*(g|ml)\s*[,，x×*]\s*(\d+)/i);
  if (mCount) {
    const unitG = parseFloat(mCount[1]);
    const unitW = mCount[2].toLowerCase() === "ml" ? unitG / 1000 : unitG / 1000;
    // 옵션 수량이 있으면 단위무게 × 옵션수량, 없으면 title 전체 수량 사용
    if (maxQty > 1) {
      return Math.max(unitW * maxQty, 0.1);
    }
    const titleQty = parseInt(mCount[3]);
    return Math.max(unitW * titleQty, 0.1);
  }

  // title에서 단순 무게만 있는 경우 (예: "50ml", "1.5kg")
  const baseWeight = estimateWeight(title);
  if (baseWeight) {
    if (maxQty > 1) return Math.max(baseWeight * maxQty, 0.1);
    return Math.max(baseWeight, 0.1);
  }

  return null;
}


function getVariantPreview(product) {
  const allV1 = product.opt1vals?.length ? product.opt1vals : [""];
  const allV2 = product.opt2vals?.length ? product.opt2vals : [""];
  const allV3 = product.opt3vals?.length ? product.opt3vals : [""];

  let maxWeight = 0.1;

  for (const v1 of allV1) {
    for (const v2 of allV2) {
      for (const v3 of allV3) {
        const w =
          estimateVariantWeight(product.title || "", v1, v2, v3) ??
          estimateWeight(product.title || "") ??
          DEF_W[product.ruleType || product.originalType || ""] ??
          0.5;
        if (w > maxWeight) maxWeight = w;
      }
    }
  }

  const shipping = calcShipping(maxWeight);
  const origPrice = parseFloat(product.price || "0") || 0;
  const suggested = origPrice > 0 ? (origPrice + shipping).toFixed(2) : null;

  return {
    previewWeightKg: maxWeight,
    previewShipping: shipping,
    previewSuggested: suggested,
  };
}

function downloadCSV(rawRows, headers, resultMap, applyPrice, translateOptions=false) {
  // ── 재고 컬럼 완전 제외 (Shopify 재고 초기화 방지) ───────────────────────
  // 재고 컬럼 포함 — StoreBot 수량 그대로 사용
  // Qty: StoreBot 원본값 유지 / Tracker·Policy·Fulfillment는 명시적으로 설정
  const SKIP_COLS = new Set([]);
  const keepIdx = headers.map((h,i)=>SKIP_COLS.has(h)?-1:i).filter(i=>i>=0);
  const filteredHeaders = keepIdx.map(i=>headers[i]);
  const invTrackerIdx  = headers.indexOf("Variant Inventory Tracker");
  const invPolicyIdx   = headers.indexOf("Variant Inventory Policy");
  const invFulfillIdx  = headers.indexOf("Variant Fulfillment Service");

  // ── 인덱스 (원본 headers 기준) ───────────────────────────────────────────
  const idx = {
    ti:  headers.indexOf("Title"),
    yi:  headers.indexOf("Type"),
    bi:  headers.indexOf("Body (HTML)"),
    tagi:headers.indexOf("Tags"),
    pi:  headers.indexOf("Variant Price"),
    hi:  headers.indexOf("Handle"),
    gi:  headers.indexOf("Variant Grams"),
    o1n: headers.indexOf("Option1 Name"),
    o2n: headers.indexOf("Option2 Name"),
    o3n: headers.indexOf("Option3 Name"),
    o1v: headers.indexOf("Option1 Value"),
    o2v: headers.indexOf("Option2 Value"),
    o3v: headers.indexOf("Option3 Value"),
    sku: headers.indexOf("Variant SKU"),
  };
  const newPi = keepIdx.indexOf(idx.pi); // 필터된 배열에서 Variant Price 위치
  const extraH = ["Est. Weight (kg)","Shipping ($)","Original Price","Suggested Price"];

  const seen = new Set();

  const rows = rawRows.map(row => {
    const handle = row[idx.hi];

    // variantKey 우선 조회 → handle fallback
    const vk = makeVariantKey(handle, row[idx.o1v], row[idx.o2v], row[idx.o3v]);
    const r = resultMap[vk] || resultMap[handle];
    if (!r) return [...keepIdx.map(i=>row[i]),"","","",""];

    const nr = [...row];
    const isFirst = !seen.has(handle);
    seen.add(handle);

    // variant 행 여부 (옵션값 or SKU or 가격 있는 행)
    const isVariant = !!(row[idx.o1v]||row[idx.o2v]||row[idx.o3v]||row[idx.sku]||row[idx.pi]);

    // ── Title + Type: 모든 행 ─────────────────────────────────────────────
    if(idx.ti>=0) nr[idx.ti] = r.titleEn || r.title;
    if(idx.yi>=0) nr[idx.yi] = r.newType;

    // ── 옵션값 번역: translateOptions ON일 때만 ───────────────────────────
    const curO1 = idx.o1v>=0 ? (row[idx.o1v]||"") : "";
    const curO2 = idx.o2v>=0 ? (row[idx.o2v]||"") : "";
    const curO3 = idx.o3v>=0 ? (row[idx.o3v]||"") : "";
    if(translateOptions) {
      if(idx.o1v>=0&&curO1) nr[idx.o1v]=translateOptVal(curO1);
      if(idx.o2v>=0&&curO2) nr[idx.o2v]=translateOptVal(curO2);
      if(idx.o3v>=0&&curO3) nr[idx.o3v]=translateOptVal(curO3);
    }

    // ── variant 행: 무게 + 배송비 + 가격 계산 ────────────────────────────
    let varWeightKg=0, varShipping=0, varOrigPrice=0, varSuggested=null;

    if(isVariant) {
      const rowTitle = row[idx.ti] || r.title || "";
      const w = estimateVariantWeight(rowTitle, curO1, curO2, curO3) ?? (DEF_W[r.newType]||0.5);
      varWeightKg = Math.max(w, 0.1);
      varShipping = calcShipping(varWeightKg);
      varOrigPrice = parseFloat(row[idx.pi]||"0")||0;
      varSuggested = varOrigPrice>0 ? (varOrigPrice+varShipping).toFixed(2) : null;

      // Variant Grams
      if(idx.gi>=0) nr[idx.gi] = Math.round(varWeightKg*1000);
      // 가격 적용
      if(applyPrice&&idx.pi>=0&&varSuggested) nr[idx.pi] = varSuggested;
    }

    // ── 첫 행만: 설명 + 태그 + 옵션명 ───────────────────────────────────
    if(isFirst) {
      if(idx.bi>=0&&r.description)
        nr[idx.bi]=(row[idx.bi]||"")+`<div style="margin-top:16px;padding-top:12px;border-top:1px solid #eee"><p>${r.description}</p></div>`;

      const extraTags=[
        ...(r.brandTags||[]),
        ...(r.tagsEn||[]),
        ...(r.opTags||[]),
        ...(applyPrice
          ? (varSuggested ? ["shipping-included"] : ["shipping-separate"])
          : [])
      ];
      if(idx.tagi>=0&&extraTags.length) nr[idx.tagi]=mergeTags(row[idx.tagi],extraTags);

      if(translateOptions) {
        if(r.optionsEn?.length){
          r.optionsEn.forEach((opt,i)=>{ const ni=[idx.o1n,idx.o2n,idx.o3n][i]; if(ni>=0&&opt.name) nr[ni]=opt.name; });
        } else {
          if(idx.o1n>=0&&row[idx.o1n]) nr[idx.o1n]=translateOptName(row[idx.o1n]);
          if(idx.o2n>=0&&row[idx.o2n]) nr[idx.o2n]=translateOptName(row[idx.o2n]);
          if(idx.o3n>=0&&row[idx.o3n]) nr[idx.o3n]=translateOptName(row[idx.o3n]);
        }
      }
    }

    // ── 필터된 행 출력 ────────────────────────────────────────────────────
    const filteredRow = keepIdx.map(i=>nr[i]);
    if(applyPrice&&newPi>=0&&varSuggested) filteredRow[newPi]=varSuggested;
    // 재고 tracker/policy/fulfillment 명시적 설정 (Qty는 StoreBot 원본값 유지)
    const filtTrackerIdx = keepIdx.indexOf(invTrackerIdx);
    const filtPolicyIdx  = keepIdx.indexOf(invPolicyIdx);
    const filtFulfillIdx = keepIdx.indexOf(invFulfillIdx);
    if(filtTrackerIdx>=0) filteredRow[filtTrackerIdx] = "shopify";
    if(filtPolicyIdx>=0)  filteredRow[filtPolicyIdx]  = "deny";
    if(filtFulfillIdx>=0) filteredRow[filtFulfillIdx] = "manual";

    return [
      ...filteredRow,
      isVariant ? varWeightKg.toFixed(2) : "",
      isVariant ? `$${varShipping.toFixed(2)}` : "",
      isVariant && varOrigPrice>0 ? `$${varOrigPrice.toFixed(2)}` : "",
      isVariant && varSuggested ? `$${varSuggested}` : "",
    ];
  });

  const csv=[filteredHeaders.concat(extraH),...rows]
    .map(row=>row.map(c=>`"${String(c??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=Object.assign(document.createElement("a"),{
    href:URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"})),
    download:applyPrice?"guampick_final.csv":"guampick_ref.csv"
  });
  a.click();
}

const CAT_COLORS={"Korean Food > Snacks & Chips":"#FF6B35","Korean Food > Packaged Foods":"#E67E22","Korean Food > Fresh Produce":"#27AE60","Korean Food > Sauces & Condiments":"#F39C12","Korean Food > Kimchi":"#E74C3C","Korean Food > Ramen & Noodles":"#C0392B","Korean Food > Banchan":"#D35400","Korean Food > Health & Supplements":"#16A085","Korean Food > Beverages":"#3498DB","Korean Food > Bread & Bakery":"#8B4513","Beauty > Skincare":"#E91E8C","Beauty > Hair Care":"#9B59B6","Beauty > Body Care":"#8E44AD","Beauty > Mask Packs":"#FF69B4","Beauty > Sun Care":"#F1C40F","Beauty > Fragrance":"#D98880","Home & Living > Kitchenware":"#2980B9","Home & Living > Household Supplies":"#1ABC9C","Stationery & Office":"#2C3E50","Pet Supplies":"#8D6E63","$1 Bakery":"#FF8C00","Other":"#BDC3C7"};

export default function Classifier() {
  const [products,  setProducts]  = useState([]);
  const [results,   setResults]   = useState([]);
  const [rMap,      setRMap]      = useState({});
  const [headers,   setHeaders]   = useState([]);
  const [rawRows,   setRawRows]   = useState([]);
  const [progress,  setProgress]  = useState(0);
  const [running,   setRunning]   = useState(false);
  const [done,      setDone]      = useState(false);
  const [drag,      setDrag]      = useState(false);
  const [fileName,  setFileName]  = useState("");
  const [tab,       setTab]       = useState("type");
  const [filter,    setFilter]    = useState("전체");
  const [onlyMod,   setOnlyMod]   = useState(false);
  const [applyP,    setApplyP]    = useState(true);
  const [transOpts, setTransOpts] = useState(false); // 기존 상품 재고 보호 위해 기본 OFF
  const [status,    setStatus]    = useState("");
  const fileRef=useRef(); const rMapRef=useRef({}); const rArrRef=useRef([]);

  const parseFile = useCallback(async (file) => {
    setProducts([]); setResults([]); setRMap({}); setDone(false); setProgress(0); setFileName(file.name); setStatus("");
    let csvText="";
    if(file.name.toLowerCase().endsWith(".zip")){
      if(!window.JSZip){
        await new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";s.onload=res;s.onerror=rej;document.head.appendChild(s);});
      }
      const zip=await window.JSZip.loadAsync(await file.arrayBuffer());
      const cp=Object.keys(zip.files).find(n=>n.toLowerCase().endsWith(".csv"));
      if(!cp){alert("ZIP 안에 CSV 없음");return;}
      csvText=await zip.files[cp].async("string");
    } else { csvText=await file.text(); }

    Papa.parse(csvText,{
      complete:({data:rows})=>{
        const hdr=rows[0]; setHeaders(hdr); setRawRows(rows.slice(1));
        const ti=hdr.indexOf("Title"),yi=hdr.indexOf("Type"),ii=hdr.indexOf("Image Src"),hi=hdr.indexOf("Handle"),pi=hdr.indexOf("Variant Price"),tagi=hdr.indexOf("Tags");
        const o1ni=hdr.indexOf("Option1 Name"), o1vi=hdr.indexOf("Option1 Value");
        const o2ni=hdr.indexOf("Option2 Name"), o2vi=hdr.indexOf("Option2 Value");
        const o3ni=hdr.indexOf("Option3 Name"), o3vi=hdr.indexOf("Option3 Value");

        // First pass: collect all option values per handle (across all variant rows)
        const optValMap = {}; // handle → {o1name, o1vals[], o2name, o2vals[], o3name, o3vals[]}
        rows.slice(1).forEach(r=>{
          const h=r[hi]; if(!h) return;
          if(!optValMap[h]) optValMap[h]={
            o1name:r[o1ni]||"", o1vals:new Set(),
            o2name:r[o2ni]||"", o2vals:new Set(),
            o3name:r[o3ni]||"", o3vals:new Set(),
          };
          if(r[o1vi]) optValMap[h].o1vals.add(r[o1vi]);
          if(r[o2vi]) optValMap[h].o2vals.add(r[o2vi]);
          if(r[o3vi]) optValMap[h].o3vals.add(r[o3vi]);
        });

        const seen=new Set(); const prods=[];
        rows.slice(1).forEach(r=>{
          const h=r[hi];
          if(h&&!seen.has(h)){
            seen.add(h);
            const ov=optValMap[h]||{};
            prods.push({
              handle:h, title:r[ti]||"", image:r[ii]||"",
              originalType:r[yi]||"", price:r[pi]||"0", tags:r[tagi]||"",
              opt1name: ov.o1name||"", opt1vals: [...(ov.o1vals||[])],
              opt2name: ov.o2name||"", opt2vals: [...(ov.o2vals||[])],
              opt3name: ov.o3name||"", opt3vals: [...(ov.o3vals||[])],
            });
          }
        });
        setProducts(prods);
      },
    });
  },[]);

  const onDrop=(e)=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)parseFile(f);};


function finalFallback(title="", tags="") {
  const t = `${title} ${tags}`.toLowerCase();
  // Baby 먼저 (milk powder 등 식품 키워드와 충돌 방지)
  if (/infant formula|baby formula|follow.?up formula|newborn formula|stage.{0,5}formula|stick formula|milk powder(?!.*protein)/.test(t)) return "Baby & Kids > Baby Care";
  if (/\bbaby\b|\binfant\b|\btoddler\b|diaper|baby bib|burp cloth|pacifier|teether|baby bottle|baby swim|swim float|아기|유아|분유|기저귀|베이비/.test(t)) return "Baby & Kids > Baby Care";
  if (/frozen.*veg|frozen.*mix.*veg|mixed.*frozen.*veg|냉동.*야채|냉동.*채소|냉동.*믹스/.test(t)) return "Korean Food > Packaged Foods";
  if (/frozen.*seafood|seafood.*frozen|assorted.*seafood|frozen.*shrimp|frozen.*clam/.test(t)) return "Korean Food > Packaged Foods";
  if (/thermal.*mist|spring water.*mist|avene.*mist|moisture.*mist|soothing.*mist|hydrating.*mist|ampoule.*mist/.test(t)) return "Beauty > Skincare";
  if (/black soybean|seoritae|서리태|검정콩/.test(t)) return "Korean Food > Fresh Produce";
  // 염색약
  if (/hair dye|hair color|bleach|염색약|염모제|탈색제/.test(t)) return "Beauty > Hair Care";
  if (/shampoo|conditioner|treatment|hair mask|rinse|샴푸|헤어/.test(t)) return "Beauty > Hair Care";
  // 스킨케어
  if (/foundation|bb cream|cc cream|concealer|mascara|lip tint|sun cushion|facial mist|soothing mist|hydrating mist/.test(t)) return "Beauty > Skincare";
  if (/spf|sunscreen|sun cream|uv protection/.test(t)) return "Beauty > Sun Care";
  if (/lotion|moisturizer|skin care for men|men.*grooming/.test(t)) return "Beauty > Skincare";
  // 향수
  if (/\bperfume\b|eau de|\bcologne\b|fragrance(?!.*rinse)|\bdiffuser\b|향수/.test(t)) return "Beauty > Fragrance";
  // 떡볶이
  if (/tteokbokki|떡볶이|rice cake.*spicy|spicy.*rice cake|korean rice cake/.test(t)) return "Korean Food > Packaged Foods";
  // 곡물류 → Packaged Foods
  if (/grain mix|multigrain|잡곡|현미(?!.*snack)/.test(t) && !/fresh|raw|snack/.test(t)) return "Korean Food > Packaged Foods";
  // 신선 밤/율무는 Fresh
  if (/fresh chestnut|raw chestnut|peeled chestnut|fresh barley/.test(t)) return "Korean Food > Fresh Produce";
  // 식품
  if (/protein|collagen|vitamin|supplement|probiotics/.test(t)) return "Korean Food > Health & Supplements";
  if (/sauce|dressing|teriyaki|chipotle|\bstock\b|bouillon|dashida/.test(t)) return "Korean Food > Sauces & Condiments";
  if (/snack|chips|cookie|cracker|candy|gummy|jelly/.test(t)) return "Korean Food > Snacks & Chips";
  if (/bread|cake|bagel|castella|bakery/.test(t)) return "Korean Food > Bread & Bakery";
  if (/mix powder|vegetable.*powder|fruit.*blend|superfood/.test(t)) return "Korean Food > Health & Supplements";
  // 생활용품
  if (/seat cushion|chair cushion|sofa cushion|방석|쿠션 커버/.test(t)) return "Home & Living > Home & Interior";
  return "Other";
}

  const start=async()=>{
    if(!products.length||running) return;
    setRunning(true); setDone(false); rMapRef.current={}; rArrRef.current=[]; setResults([]); setRMap({});

    setStatus("⚡ 규칙 기반 분류 중...");
    const pre = products.map(p => {
      const rc = ruleClassify(p.title, p.tags);
      const brandTags = detectBrands(p.title + " " + p.tags);
      const preview = getVariantPreview({ ...p, ruleType: rc?.type || null });
      return {
        ...p,
        ruleType: rc?.type || null,
        ruleSrc: rc?.src || "ai",
        weightKg: preview.previewWeightKg,
        brandTags,
        previewShipping: preview.previewShipping,
        previewSuggested: preview.previewSuggested,
      };
    });

    const BATCH=8;
    for(let i=0;i<pre.length;i+=BATCH){
      const chunk=pre.slice(i,i+BATCH);
      await Promise.allSettled(chunk.map(async p=>{
        let titleEn=p.title, description="", aiType=null, optionsEn=[], tagsEn=[];

        // ── 1단계: 분류 (룰 기반 우선, 애매한 것만 AI) ───────────────────────
        if(!p.ruleType){
          try{
            const t=await claude(AI_TYPE_PROMPT, p.title, 60);
            const nt=normalizeType(t.trim());
            if(nt&&ALLOWED_TYPES.has(nt)) aiType=nt;
          }catch(_){}
        }

        // ── 2단계: 영어 통일 (제목/설명/옵션/태그) ───────────────────────────
        try{
          const input = [
            `Title: ${p.title}`,
            `Tags: ${p.tags}`,
            `Option1 Name: ${p.opt1name}`,
            `Option1 Values: ${p.opt1vals.join(", ")}`,
            `Option2 Name: ${p.opt2name}`,
            `Option2 Values: ${p.opt2vals.join(", ")}`,
            `Option3 Name: ${p.opt3name}`,
            `Option3 Values: ${p.opt3vals.join(", ")}`,
          ].join("\n");
          const raw=await claude(TRANS_PROMPT, input, 500);
          const m=raw.match(/\{[\s\S]*\}/);
          if(m){
            const j=JSON.parse(m[0]);
            const en=postProcessEnglishData(j);
            titleEn=cleanTitle(en.title_en||p.title);
            description=en.description_en||"";
            optionsEn=en.options||[];
            tagsEn=en.tags_en||[];

            // ── 3단계: 한글 잔존 검사 → 재시도 ──────────────────────────────
            if(!en.isEnglishOnly){
              try{
                const retryInput = JSON.stringify({title_en:titleEn,description_en:description,options:optionsEn,tags_en:tagsEn});
                const retryRaw=await claude(RETRY_PROMPT, retryInput, 400);
                const rm=retryRaw.match(/\{[\s\S]*\}/);
                if(rm){
                  const rj=JSON.parse(rm[0]);
                  const ren=postProcessEnglishData(rj);
                  if(ren.isEnglishOnly){
                    titleEn=cleanTitle(ren.title_en||titleEn);
                    description=ren.description_en||description;
                    optionsEn=ren.options||optionsEn;
                    tagsEn=ren.tags_en||tagsEn;
                  }
                }
              }catch(_){}
            }

            // 그래도 한글 남으면 원본 제목 유지
            if(hasKorean(titleEn)) titleEn=cleanTitle(p.title);
            const aiBrands=detectBrands(titleEn+" "+tagsEn.join(" "));
            if(aiBrands.length) p.brandTags=[...new Set([...p.brandTags,...aiBrands])];
          }
        }catch(_){}

        let finalType = p.ruleType || aiType || normalizeType(p.originalType || "") || "Other";

        if (!ALLOWED_TYPES.has(finalType) || finalType.toLowerCase() === "life") {
          finalType = ruleClassify(p.title, p.tags)?.type || "Other";
        }

        // Other인데 AI가 유효한 타입 갖고 있으면 AI 존중
        if (finalType === "Other" && aiType && ALLOWED_TYPES.has(aiType) && aiType.toLowerCase() !== "life") {
          finalType = aiType;
        }

        // 식품 키워드 있어도 Packaged Foods 강제 금지 → rescue 먼저
        const looksFoodLike = /food|김치|라면|과자|간장|식초|만두|떡볶이|국수|빵|쿠키|젤리|사탕|snack|ramen|sauce|vinegar|dumpling|bread|cookie|candy/i.test(`${p.title} ${p.tags}`);
        if (finalType === "Other" && looksFoodLike) {
          const foodRescue = rescueClassify(p.title, p.tags);
          if (foodRescue) finalType = foodRescue.type;
        }

        // ── 2차: Rescue Rule (Other 전용) ──────────────────────────────────
        if (finalType === "Other") {
          const rescue = rescueClassify(p.title, p.tags);
          if (rescue) { finalType = rescue.type; p.ruleSrc = "rescue"; }
        }

        // ── 3차: AI 재분류 (여전히 Other인 경우만) ─────────────────────────
        if (finalType === "Other") {
          try {
            const retryRaw = await claude(
              `Classify this product into exactly ONE type. NEVER output "life" or "Other" unless truly unclassifiable. Reply with ONLY the type name:\n${TYPES.join("\n")}`,
              `Title: ${p.titleEn || p.title}\nOriginal: ${p.title}`,
              60
            );
            const nt = normalizeType(retryRaw.trim());
            if (nt && ALLOWED_TYPES.has(nt) && nt.toLowerCase() !== "life") {
              finalType = nt; p.ruleSrc = "ai-retry";
            }
          } catch(_) {}
        }

        // 최후 fallback — 여전히 Other이면 키워드 기반 강제 분류
        if (finalType === "Other") {
          finalType = finalFallback(p.title, p.tags);
        }

        const needsReview = REVIEW_TYPES.has(finalType);
        const origPrice = parseFloat(p.price) || 0;
        const shipping = p.previewShipping ?? calcShipping(p.weightKg);
        const suggested = p.previewSuggested ?? (origPrice > 0 ? (origPrice + shipping).toFixed(2) : null);
        const result={
          ...p, newType:finalType, titleEn, description, optionsEn, tagsEn,
          shipping, origPrice, suggested, needsReview,
          confidence: p.ruleType ? 0.98 : aiType ? 0.85 : 0.5,
          src: p.ruleSrc || (aiType ? "ai" : "fallback"),
          usedDefaultWeight: estimateWeight(p.title) == null,
        };
        result.opTags = generateOperationalTags(result);

        // handle 기준 저장 (fallback용) + 각 variant 조합으로도 저장
        const newMap = { ...rMapRef.current, [p.handle]: result };
        const allV1 = p.opt1vals.length ? p.opt1vals : [""];
        const allV2 = p.opt2vals.length ? p.opt2vals : [""];
        const allV3 = p.opt3vals.length ? p.opt3vals : [""];
        for (const v1 of allV1) for (const v2 of allV2) for (const v3 of allV3) {
          newMap[makeVariantKey(p.handle, v1, v2, v3)] = result;
        }
        rMapRef.current = newMap;
        rArrRef.current=[...rArrRef.current,result];
        setRMap({...rMapRef.current}); setResults([...rArrRef.current]);
      }));
      setProgress(Math.min(i+BATCH,pre.length));
      setStatus(`🌐 AI 번역 중... ${Math.min(i+BATCH,pre.length)}/${pre.length}`);
      await new Promise(r=>setTimeout(r,150));
    }
    setDone(true); setRunning(false); setStatus("");
  };

  const typeCounts=results.reduce((a,r)=>({...a,[r.newType]:(a[r.newType]||0)+1}),{});
  const typeKeys=["전체",...Object.keys(typeCounts).sort()];
  const displayed=results.filter(r=>filter==="전체"||r.newType===filter).filter(r=>!onlyMod||r.newType!==r.originalType||r.titleEn!==r.title);

  return (
    <div style={s.root}>
      <h1 style={s.title}>상품 분류</h1>
      <p style={s.sub}>CSV/ZIP → 35개 카테고리 재분류 + 영문번역 + 배송비 + Shopify CSV</p>

      {/* Drop zone */}
      <div style={{...s.drop,...(drag?s.dropOn:{})}} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={onDrop} onClick={()=>fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept=".csv,.zip" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)parseFile(f);}}/>
        {fileName ? (
          <div style={s.fileRow}>
            <span style={{fontSize:32}}>{fileName.endsWith(".zip")?"🗜️":"📄"}</span>
            <div><div style={s.fname}>{fileName}</div><div style={s.fstat}>{products.length>0?`${products.length}개 고유 상품`:"분석 중..."}</div></div>
          </div>
        ):(
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:28,color:"#ccc",marginBottom:8}}>↑</div>
            <div style={{fontSize:14,fontWeight:600,color:"#444",marginBottom:8}}>Shopify CSV 또는 ZIP 드래그 또는 클릭</div>
            <div style={{display:"flex",gap:6,justifyContent:"center"}}>
              {[".csv",".zip"].map(e=><span key={e} style={s.badge}>{e}</span>)}
            </div>
          </div>
        )}
      </div>

      {products.length>0&&!done&&(
        <div style={s.optRow}>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}>
            <input type="checkbox" checked={applyP} onChange={e=>setApplyP(e.target.checked)}/>
            Variant Price에 <b>배송비 포함 가격</b> 적용
          </label>
          <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #f0f0f0"}}>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}>
              <input type="checkbox" checked={transOpts} onChange={e=>setTransOpts(e.target.checked)}/>
              옵션명 / 옵션값 영문 번역
            </label>
            <div style={{fontSize:11,marginTop:4,marginLeft:22,color:transOpts?"#E74C3C":"#27AE60"}}>
              {transOpts
                ? "⚠️ 기존 상품 재고 0 초기화 위험 — 신규 상품에만 사용"
                : "✅ OFF (기본값) — 기존 재고 안전 유지"}
            </div>
          </div>
        </div>
      )}

      {products.length>0&&(
        <button style={{...s.runBtn,...(running?s.runOff:{})}} onClick={start} disabled={running}>
          {running?status||`처리 중... ${progress}/${products.length}`:`🚀 분류 + 번역 + 배송비 시작 (${products.length}개)`}
        </button>
      )}

      {(running||done)&&products.length>0&&(
        <div style={s.progRow}>
          <div style={s.track}><div style={{...s.bar,width:`${(progress/products.length)*100}%`}}/></div>
          <span style={s.pct}>{Math.round((progress/products.length)*100)}%</span>
        </div>
      )}

      {results.length>0&&(
        <div style={{animation:"slideUp 0.4s ease"}}>
          <div style={s.sumCard}>
            <div style={s.sumHdr}>
              <span style={s.sumTitle}>{done?`완료 — ${results.length}개`:`처리 중... ${results.length}/${products.length}`}</span>
              {done&&(
                <div style={{display:"flex",gap:8}}>
                  <button style={{...s.dlBtn,background:"#fff",color:"#111",border:"1.5px solid #ddd"}} onClick={()=>downloadCSV(rawRows,headers,rMap,false,transOpts)}>참고용</button>
                  <button style={s.dlBtn} onClick={()=>downloadCSV(rawRows,headers,rMap,true,transOpts)}>⬇ Shopify CSV</button>
                </div>
              )}
            </div>
            <div style={s.statRow}>
              {[
                {v:results.filter(r=>r.src?.includes("rule")).length,l:"규칙 분류",c:"#27AE60"},
                {v:results.filter(r=>r.src==="ai").length,l:"AI 분류",c:"#2980B9"},
                {v:results.filter(r=>r.brandTags?.length>0).length,l:"브랜드 태그",c:"#E91E8C"},
                {v:`$${results.length?(results.reduce((a,r)=>a+(r.shipping||0),0)/results.length).toFixed(2):"0"}`,l:"평균 배송비",c:"#E74C3C"},
              ].map((item,i)=>(
                <div key={i} style={s.statCard}><span style={{...s.statN,color:item.c}}>{item.v}</span><span style={s.statL}>{item.l}</span></div>
              ))}
            </div>
            <div style={s.catGrid}>
              {Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).map(([type,cnt])=>(
                <div key={type} style={{...s.catCard,borderLeftColor:CAT_COLORS[type]||"#999",background:filter===type?"#fff5f2":"#fff"}} onClick={()=>setFilter(filter===type?"전체":type)}>
                  <div style={{...s.catDot,background:CAT_COLORS[type]||"#999"}}/>
                  <div><div style={s.catN}>{type}</div><div style={s.catC}>{cnt}개</div></div>
                </div>
              ))}
            </div>
          </div>

          <div style={s.ctrlRow}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["type","카테고리"],["title","영문번역"],["shipping","배송비"],["tags","브랜드태그"]].map(([t,l])=>(
                <button key={t} style={{...s.tabBtn,...(tab===t?s.tabOn:{})}} onClick={()=>setTab(t)}>{l}</button>
              ))}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:6}}>
              {typeKeys.map(k=>(
                <button key={k} style={{...s.ftab,...(filter===k?s.ftabOn:{})}} onClick={()=>setFilter(k)}>
                  {k} ({k==="전체"?results.length:typeCounts[k]||0})
                </button>
              ))}
            </div>
            <label style={{fontSize:12,color:"#666",cursor:"pointer",marginTop:4}}>
              <input type="checkbox" checked={onlyMod} onChange={e=>setOnlyMod(e.target.checked)} style={{marginRight:4}}/>수정된 항목만
            </label>
          </div>

          <div style={s.tblWrap}>
            <table style={s.tbl}>
              <thead>
                <tr>
                  <th style={s.th}>#</th><th style={s.th}>이미지</th>
                  {tab==="type"    &&<><th style={s.th}>상품명</th><th style={s.th}>기존</th><th style={s.th}>→ 새 Type</th><th style={s.th}>출처</th></>}
                  {tab==="title"   &&<><th style={s.th}>원본</th><th style={s.th}>→ 영문명</th><th style={s.th}>상세설명</th></>}
                  {tab==="shipping"&&<><th style={s.th}>영문명</th><th style={s.th}>대표 무게</th><th style={s.th}>대표 배송비</th><th style={s.th}>현재가</th><th style={s.th}>→ 대표 제안가</th></>}
                  {tab==="tags"    &&<><th style={s.th}>상품명</th><th style={s.th}>감지 브랜드</th><th style={s.th}>추가 태그</th></>}
                  <th style={s.th}>신뢰도</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((r,i)=>{
                  const tc=r.newType!==r.originalType;
                  return(
                    <tr key={r.handle} style={{...s.tr,...(tc?s.trMod:{})}}>
                      <td style={s.tdN}>{i+1}</td>
                      <td style={s.tdI}>{r.image?<img src={r.image} alt="" style={s.thumb} onError={e=>e.target.style.display="none"}/>:<div style={s.noImg}>—</div>}</td>
                      {tab==="type"&&<>
                        <td style={s.td}><span style={s.nKr}>{r.title}</span></td>
                        <td style={s.td}><span style={{...s.typeOld,...(tc?s.typeW:{})}}>{r.originalType||"—"}</span></td>
                        <td style={s.td}><span style={{...s.pill,background:CAT_COLORS[r.newType]||"#999"}}>{r.newType}</span>{tc&&<span style={s.mark}>✓</span>}{r.needsReview&&<span style={s.reviewMark}>검수</span>}</td>
                        <td style={s.td}><span style={{...s.srcB,...(r.src?.includes("rule")?s.srcRule:r.src==="ai"?s.srcAI:s.srcFall)}}>{r.src?.includes("rule")?"규칙":r.src==="ai"?"AI":"기본"}</span></td>
                      </>}
                      {tab==="title"&&<>
                        <td style={s.td}><span style={s.nKr}>{r.title}</span></td>
                        <td style={s.td}><span style={s.nEn}>{r.titleEn||"—"}</span></td>
                        <td style={{...s.td,maxWidth:280}}><span style={{fontSize:11,color:"#666",lineHeight:1.5}}>{r.description||"—"}</span></td>
                      </>}
                      {tab==="shipping"&&<>
                        <td style={s.td}><span style={s.nKr}>{r.titleEn||r.title}</span></td>
                        <td style={s.td}><b style={{color:"#2980B9"}}>{r.weightKg?.toFixed(2)}kg</b><span style={{fontSize:10,color:"#aaa",marginLeft:4}}>→{Math.ceil(r.weightKg||0)}kg</span></td>
                        <td style={s.td}><b style={{color:"#E74C3C"}}>${r.shipping?.toFixed(2)}</b></td>
                        <td style={s.td}><span style={{color:"#888"}}>{r.origPrice>0?`$${r.origPrice.toFixed(2)}`:"—"}</span></td>
                        <td style={s.td}>{r.suggested?<b style={{color:"#27AE60"}}>${r.suggested}</b>:<span style={{color:"#ccc",fontSize:11}}>없음</span>}</td>
                      </>}
                      {tab==="tags"&&<>
                        <td style={s.td}><span style={s.nKr}>{r.title}</span></td>
                        <td style={s.td}>{r.brandTags?.length?r.brandTags.map(t=><span key={t} style={s.brandTag}>{t}</span>):<span style={{color:"#ccc",fontSize:11}}>없음</span>}</td>
                        <td style={s.td}><span style={{fontSize:11,color:"#666"}}>{mergeTags(r.tags,r.brandTags||[])}</span></td>
                      </>}
                      <td style={s.tdC}>
                        <div style={s.cBar}><div style={{...s.cFill,width:`${Math.round((r.confidence||0)*100)}%`,background:r.confidence>.9?"#27AE60":r.confidence>.7?"#F39C12":"#E74C3C"}}/></div>
                        <span style={{fontSize:10,color:"#999"}}>{Math.round((r.confidence||0)*100)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {done&&(
            <div style={s.guide}>
              <b>📥 Shopify 재임포트:</b> Products → Import → <b>Overwrite existing products 체크</b> → Import<br/>
              <span style={{fontSize:11,color:"#888"}}>Handle 기준 매칭 · Variant 재고/가격 유지 · Body HTML에 영문설명 추가 · 브랜드 태그 병합</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  root:{animation:"slideUp 0.4s ease"},
  title:{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:800,marginBottom:4},
  sub:{fontSize:13,color:"#888",marginBottom:24},
  drop:{border:"2px dashed #d0cdc7",borderRadius:16,padding:"28px 24px",background:"#fff",cursor:"pointer",marginBottom:12,transition:"all 0.2s"},
  dropOn:{borderColor:"#FF6B35",background:"#fff8f5"},
  fileRow:{display:"flex",alignItems:"center",gap:14},
  fname:{fontSize:15,fontWeight:700},
  fstat:{fontSize:12,color:"#FF6B35",fontWeight:600,marginTop:2},
  badge:{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:6,background:"#f0f0f0",color:"#555"},
  optRow:{background:"#fff",borderRadius:10,padding:"10px 16px",marginBottom:10},
  runBtn:{width:"100%",padding:"14px",background:"#FF6B35",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",marginBottom:12},
  runOff:{opacity:0.65,cursor:"not-allowed"},
  progRow:{display:"flex",alignItems:"center",gap:10,marginBottom:16},
  track:{flex:1,height:6,background:"#e0e0e0",borderRadius:10,overflow:"hidden"},
  bar:{height:"100%",background:"#FF6B35",borderRadius:10,transition:"width 0.3s"},
  pct:{fontSize:12,fontWeight:700,color:"#FF6B35",width:36},
  sumCard:{background:"#fff",borderRadius:16,padding:"20px",marginBottom:14},
  sumHdr:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8},
  sumTitle:{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:800},
  dlBtn:{padding:"9px 16px",background:"#111",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"},
  statRow:{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"},
  statCard:{flex:1,minWidth:90,background:"#f8f8f8",borderRadius:10,padding:"10px",textAlign:"center"},
  statN:{display:"block",fontSize:20,fontFamily:"'Syne',sans-serif",fontWeight:800},
  statL:{fontSize:10,color:"#999",display:"block",marginTop:2},
  catGrid:{display:"flex",flexWrap:"wrap",gap:6},
  catCard:{display:"flex",alignItems:"center",gap:7,padding:"7px 11px",border:"1px solid #eee",borderLeft:"3px solid #999",borderRadius:8,cursor:"pointer",transition:"background 0.15s"},
  catDot:{width:7,height:7,borderRadius:"50%",flexShrink:0},
  catN:{fontSize:11,fontWeight:600},
  catC:{fontSize:10,color:"#999"},
  ctrlRow:{display:"flex",flexDirection:"column",gap:6,marginBottom:12},
  tabBtn:{padding:"7px 16px",fontSize:13,fontWeight:600,border:"1.5px solid #e0e0e0",borderRadius:8,background:"#fff",cursor:"pointer",color:"#888"},
  tabOn:{borderColor:"#111",color:"#111"},
  ftab:{fontSize:10,padding:"4px 10px",border:"1.5px solid #e0e0e0",borderRadius:20,background:"#fff",cursor:"pointer",color:"#888",fontWeight:600},
  ftabOn:{borderColor:"#FF6B35",color:"#FF6B35",background:"#fff5f2"},
  tblWrap:{background:"#fff",borderRadius:16,overflow:"auto",marginBottom:14},
  tbl:{width:"100%",borderCollapse:"collapse",fontSize:13},
  th:{textAlign:"left",padding:"12px 14px",borderBottom:"2px solid #f0f0f0",fontSize:10,fontWeight:700,color:"#999",textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap"},
  tr:{borderBottom:"1px solid #f8f8f8"},
  trMod:{background:"#fffdf5"},
  td:{padding:"10px 14px",verticalAlign:"middle"},
  tdN:{padding:"10px 8px 10px 14px",color:"#ccc",fontSize:11,verticalAlign:"middle"},
  tdI:{padding:"8px 14px",verticalAlign:"middle"},
  tdC:{padding:"10px 14px",verticalAlign:"middle",minWidth:80},
  thumb:{width:40,height:40,objectFit:"cover",borderRadius:6,border:"1px solid #eee",display:"block"},
  noImg:{width:40,height:40,background:"#f5f5f5",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",color:"#ccc",fontSize:11},
  nKr:{fontSize:12,color:"#555",maxWidth:200,display:"block"},
  nEn:{fontSize:13,fontWeight:600,maxWidth:220,display:"block"},
  typeOld:{fontSize:11,color:"#aaa",background:"#f5f5f5",padding:"2px 7px",borderRadius:4},
  typeW:{color:"#E74C3C",background:"#fff0ee"},
  pill:{fontSize:10,fontWeight:700,color:"#fff",padding:"3px 8px",borderRadius:20,whiteSpace:"nowrap",display:"inline-block"},
  mark:{fontSize:10,color:"#27AE60",fontWeight:800,marginLeft:5},
  reviewMark:{fontSize:10,color:"#E67E22",fontWeight:700,marginLeft:5,background:"#fff8ee",padding:"1px 5px",borderRadius:4},
  srcB:{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4},
  srcRule:{background:"#e8f8ee",color:"#27AE60"},
  srcAI:{background:"#e8f0ff",color:"#2980B9"},
  srcFall:{background:"#f5f5f5",color:"#aaa"},
  brandTag:{fontSize:11,fontWeight:700,background:"#fff0f6",color:"#E91E8C",padding:"2px 8px",borderRadius:20,marginRight:4,display:"inline-block"},
  cBar:{height:4,background:"#f0f0f0",borderRadius:4,overflow:"hidden",marginBottom:3,width:50},
  cFill:{height:"100%",borderRadius:4},
  guide:{background:"#f0fff4",border:"1px solid #c6f6d5",borderRadius:12,padding:"14px 18px",fontSize:13,marginBottom:16,lineHeight:1.8},
};
