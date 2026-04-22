import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import { claude } from "../api";

// ── 35 Types ─────────────────────────────────────────────────────────────────
const TYPES = [
  "Beauty > Skincare","Beauty > Hair Care","Beauty > Body Care","Beauty > Mask Packs",
  "Beauty > Sun Care","Beauty > Fragrance","Beauty > Makeup","Beauty > Oral Care",
  "Korean Food > Kimchi","Korean Food > Ramen & Noodles","Korean Food > Fresh Produce",
  "Korean Food > Snacks & Chips","Korean Food > Bread & Bakery","Korean Food > Banchan",
  "Korean Food > Sauces & Condiments","Korean Food > Health & Supplements","Korean Food > Packaged Foods",
  "Korean Food > Refrigerated Foods","Korean Food > Frozen Food","Korean Food > Beverages",
  "Fashion > Accessories","Fashion > Bags","Fashion > Socks & Hosiery","Fashion > Hats",
  "Sports & Outdoors > Exercise & Fitness","Sports & Outdoors > Golf",
  "Sports & Outdoors > Swimming","Sports & Outdoors > Outdoor & Camping",
  "Home & Living > Household Supplies","Home & Living > Kitchenware",
  "Home & Living > Home & Interior","Home & Living > Cleaning Supplies",
  "Baby & Kids > Baby Care","Baby & Kids > Toys & Games",
  "Stationery & Office","Automotive","Flowers & Gifts","Pet Supplies","Other",
];

// ── Rule-based classifier (우선순위 가이드 기준) ──────────────────────────────
// 순서: 떡볶이 → Snacks/Packaged → Bakery → Health → Sauces → Fresh → Beauty → 기타
const RULES = [
  // ── 최우선 1: 생활용품 (뷰티/식품 키워드와 혼동 방지) ─────────────────
  { type:"Home & Living > Cleaning Supplies",
    rx:/laundry detergent|fabric softener|dishwasher detergent|dishwashing.*liquid|dish soap|\bbleach\b(?!.*tooth|.*whiten|.*hair)|mold remover|mold.*spray|toilet.*cleaner|toilet.*brush|all.purpose.*cleaner|surface cleaner|floor cleaner|drain cleaner|\bclorox\b|nano.*coat.*clean|\bdowny\b|세탁.*세제|세탁액|섬유유연제|주방.*세제|식기세척|곰팡이.*제거|laundry.*capsule|capsule.*laundry|laundry.*pod|washing.*pod|세탁.*캡슐|캡슐.*세탁/i },
{ type:"Home & Living > Household Supplies",
    rx:/\bwashing machine cleaner\b|zipper bag|dr\.?\s*beckmann|snuggle|\bdowny\b|세탁조세제/i },
  { type:"Beauty > Body Care",
    rx:/body wash|body lotion|body scrub|body oil|body butter|hand cream|hand lotion|hand wash|바디워시|바디로션|바디스크럽|핸드크림|핸드로션/i },
  { type:"Home & Living > Kitchenware",
    rx:/\bscrubber\b|scouring pad|ziploc|dish cloth|\bgloves?\b(?!.*beauty|.*hand cream)|지퍼백|수세미/i },

  // ── 최우선 2: 식용 기름/양념 (헤어오일보다 먼저) ──────────────────────
  { type:"Korean Food > Sauces & Condiments",
    rx:/sesame oil|perilla oil|참기름|들기름|\bsalt\b(?!.*hair|.*beauty|.*scrub|.*body)|소금(?!.*bath|.*body)|secret coin|동전육수|coin.*stock|coin.*broth|big mama.*coin|refreshing.*coin(?!.*bitcoin)|beverage.*base|\bflavor base\b|drink.*base|cocktail.*mixer|tomato paste|double.*concentrated.*tomato|tomato puree|tomato concentrate(?!.*drink)|mutti|pomodoro/i },

  // ── 최우선 3: 꽃/선물 (soap 단독 세정제 오염 방지) ───────────────────
  { type:"Flowers & Gifts",
    rx:/soap flower|비누꽃|preserved flower|\bbouquet\b|꽃다발|peony.*(?:bouquet|flower|gift)|rose.*bouquet|조화|프리저브드|folding fan|feather fan|paper fan|silk fan|hanji.*fan|handheld.*fan|\bnecklace\b(?!.*chain store)|\bkeyring\b|key ring|lucky amulet|tassel charm|traditional.*charm|norigae|hanbok.*apron|hanbok.*gown|traditional.*apron|twine.*set(?!.*kitchen)/i },

  // ── 뷰티 최우선 차단 ──────────────────────────────────────────────────
  // 염색약/헤어컬러 — 스킨케어로 빠지기 전에 먼저 잡음
  { type:"Beauty > Makeup",
    rx:/\bfoundation\b|cushion foundation|\bbb cream\b|\bcc cream\b(?!.*vitamin|.*probio)|\bconcealer\b|\bprimer\b(?!.*skincare|.*serum)|lipstick|lip gloss|lip tint|lip balm|eyeshadow|eye shadow|\bblush\b(?!.*drink|.*powder|.*blush.*cheek.*cream)|\bhighlighter\b|\beyeliner\b|\bmascara\b|setting powder|setting spray|makeup.*base|tinted.*base|bb.*cushion|cover pact|tone up cream(?!.*body)|makeup/i },
{ type:"Beauty > Makeup",
    rx:/파운데이션|쿠션팩트|비비크림|컨실러|립스틱|립글로스|립밤|아이섀도|블러셔|하이라이터|아이라이너|마스카라|프라이머|메이크업/i },
{ type:"Beauty > Oral Care",
    rx:/toothbrush|toothpaste|mouthwash|dental floss|teeth whitening|whitening gel(?!.*skin)|mouth guard|tongue cleaner|oral.*care|dental.*care|치솔|칫솔|치약|구강청결|구강세정|구강/i },
{ type:"Beauty > Hair Care",
    rx:/hair wax|hair gel|hair spray|hair pomade|hair gloss|hair mask|hair pack|hair serum|hair oil|hair essence|hair mist|hair tonic|styling.*wax|styling.*gel|strong hold.*spray|hair dye|hair color|hair colouring|color cream|bleach|염색약|염모제|탈색제|새치염색/i },
  // 쿠션파운데이션 — 방석 쿠션과 분리
  { type:"Beauty > Sun Care",
    rx:/sun cushion|sun.*cushion|soothing.*sun stick|moisture.*sun stick/i },
  // Kitchenware — Sauces보다 먼저
  { type:"Home & Living > Kitchenware",
    rx:/grinder|pepper mill|salt grinder|chopper|peeler|slicer|kitchen tool|utensil|garlic press|다지기|채칼/i },

  // ── Korean Food ───────────────────────────────────────────────────────
  { type:"Korean Food > Kimchi",
    rx:/kimchi|kimchee|김치|깍두기|kkakdugi|총각김치|열무김치|동치미|백김치/i },
  { type:"Korean Food > Banchan",
    rx:/banchan|반찬|namul|나물|muchim|무침|jorim|조림|장아찌|멸치볶음|콩자반|오징어채볶음|깻잎장아찌|깻잎무침|젓갈|dried radish|무말랭이|cheonggukjang|청국장|dried rapeseed|rapeseed greens|wild greens|건나물|건조나물|seaweed sheet|dried.*seaweed(?!.*snack)|seaweed soup(?!.*powder)|seasoned.*vegetable.*dried|dried.*seasoned.*vegetable|laver(?!.*nori.*snack)|seaweed.*flake|kim.*jaban|\bkimjaban\b|seaweed.*seasoning/i },

  // ⚠️ Ramen & Noodles — 가장 먼저 (별도 카테고리)
  { type:"Korean Food > Ramen & Noodles",
    rx:/ramen|라면|jjajang|짜장면|instant noodle|noodle meal|국수|udon|우동|냉면|naengmyeon|rice noodle|vermicelli|당면|쌀국수|컵라면|봉지라면|신라면|진라면|너구리|안성탕면|불닭|짜파게티/i },

  // ⚠️ 떡볶이 — Snacks보다 먼저
  { type:"Korean Food > Frozen Food",
    rx:/frozen(?!.*yogurt|.*berry|.*fruit.*fresh)|냉동(?!.*해제|.*보관 후)|frozen meal|frozen fried rice|frozen.*dumpling|frozen.*cutlet|frozen.*steak|frozen.*wing|frozen.*nugget/i },
{ type:"Korean Food > Refrigerated Foods",
    rx:/chilled(?!.*cream|.*drink)|refrigerated(?!.*cream)|냉장(?!.*보관 후)|fresh.*pork.*cut|fresh.*beef.*cut|fresh.*duck.*cut|marinated.*pork|marinated.*beef|marinated.*chicken|bulgogi(?!.*sauce)|fresh.*galbi/i },
{ type:"Korean Food > Beverages",
    rx:/\bjuice\b(?!.*lens|.*eye|.*vitamin.*capsule)|cold brew|\bcoffee.*\d+ml\b|coffee.*pack.*of|probiotic.*drink(?!.*capsule)|aloe.*drink|\bmilk\b(?!.*thistle|.*bath|.*formula|.*lotion|.*colostrum|.*protein|.*supplement|.*capsule|.*baobab|.*hair|.*shampoo).*(?:pack|bottle|ml|litre)|\bilohas\b|flavored.*water|vitamin.*water(?!.*supplement)|energy drink|sports drink|\bdrink\b.*(?:pack of \d+|\d+ml.*pack)|capri.*sun/i },
{ type:"Korean Food > Beverages",
    rx:/음료|주스(?!.*눈|.*렌즈)|커피.*캔|우유.*팩|두유|식혜|수정과|매실|홍초/i },
{ type:"Korean Food > Packaged Foods",
    rx:/tteokbokki|떡볶이|컵떡볶이|즉석떡볶이|\boat rice\b|\bgrain rice\b|mixed.*grain(?!.*bowl)|잡곡밥(?!.*즉석)/i },

  // ⚠️ Snacks — protein bar/energy bar 제거 (Health로 보냄)
  { type:"Korean Food > Snacks & Chips",
    rx:/chips|cracker|cookie|biscuit|candy|gummy|jelly candy|popcorn|snacks?|rice puff|snack puff|chocolate|초콜릿|콘칲|칩|과자|스낵|사탕|젤리(?!.*vitamin)|쿠키|비스킷|팝콘|강냉이|뻥튀기|나쵸|빼빼로|새우깡|꼬북칩|홈런볼|오징어집|꼬깔콘|프링글|누룽지칩|누룽지(?!.*죽)|누룽지과자|쌀과자|곡물과자|스낵바|roasted seaweed|seaweed snack|김스낵|lollipop|mixed nuts|nuts|almonds?|walnuts?|cereal|yukwa|유과|강정|fruit snack|honey snack|confectionery|nut mix|trail mix|haitai|orion|lotte(?!.*hotel)|crown(?!.*cork)|haetae|grilled.*seaweed|seasoned.*seaweed|gimtae|laver snack|\bfranks\b|\bsausage\b(?!.*pasta)|hot dog|corn dog|mini.*sausage|cocktail.*sausage|\bgalchi mi\b|\bgalchi\b(?!.*stew)|beef.*jerky|dried.*snack.*beef|roasted.*chestnut|peanut.*roche|rocher.*peanut|doughnut|donut|\bmochi\b(?!.*mask|.*skin)|\bchurro\b|\bwaffle\b(?!.*maker)|twisted.*snack|scorched rice|nurungji|누룽지|roasted.*rice(?!.*extract)|puffed rice snack|cheese.*roll(?!.*sushi)|crispy.*rice.*(?:roll|snack)|baked.*rice.*roll|korean rice.*crisp/i },

  // ⚠️ Packaged Foods = 식사/즉석조리용 (라면/국수류 제외 — Ramen & Noodles로)
  { type:"Korean Food > Packaged Foods",
    rx:/dumpling|만두|frozen meal|냉동식품|frozen(?!.*yogurt|.*fruit|.*berry)|냉동|porridge|죽|pumpkin porridge|호박죽|instant meal|즉석식품|ready.to.eat|즉석밥|햇반|cooked rice|instant rice|meal kit|밀키트|curry|카레|bibimbap|비빔밥|soup(?!.*base)|soup base|broth|육수|sundae|순대|pasta(?!.*sauce)|brown rice(?!.*snack)|multigrain rice|영양밥|잡곡밥|현미밥/i },

  // Bakery
  { type:"Korean Food > Bread & Bakery",
    rx:/bread|bakery|식빵|빵|크루아상|바게트|베이글|머핀|스콘|toast bread|sandwich bread|croissant|bagel|muffin|scone|roll cake|카스테라|pastry|danish|hotcake mix|pancake mix|cake mix|베이킹 믹스|sprinkles|topping sugar|decor sugar/i },

  // Health — protein bar 포함, energy bar 포함
  { type:"Korean Food > Health & Supplements",
    rx:/vitamin|비타민|probiotics|유산균|protein powder|protein\b(?!.*shampoo|.*conditioner|.*hair.*color|.*dye|.*hair.*treatment)|프로틴|단백질 파우더|protein bar|energy bar|granola bar|collagen(?!.*cream|.*serum|.*eye|.*foundation|.*mask|.*cleanser|.*lotion|.*toner|.*ampoule|.*mist|.*foam)|콜라겐(?!.*크림|.*세럼|.*아이|.*파운|.*마스크|.*클렌)|red ginseng|홍삼|omega\s*3?|오메가\s*3?|arginine|아르기닌|루테인|영양제|보충제|honey stick|honey jelly|홍삼스틱|건강젤리|health jelly|health supplement|diet supplement|herbal.*extract(?!.*skincare)|plant.*extract(?!.*skincare)|wild herb.*extract|bush clover|gondre.*extract|\balbumin\b(?!.*skin|.*face)|\beaa\b|essential amino acid|amino acid.*(?:supplement|boost|powder|jar)|\beaa.*boost|calobye|drinkable.*(?:albumin|protein|collagen)|garcinia(?!.*cream|.*serum)|catechin(?!.*face.*cream|.*skin.*extract)|\bhca\b|weight management|diet.*supplement|antioxidant.*(?:support|tablet|capsule)|green tea extract.*tablet|\d+\s*tablets?\b|\d+\s*capsules?\b/i },

  // Sauces
  { type:"Korean Food > Sauces & Condiments",
    rx:/gochujang|고추장|doenjang|된장|soy sauce|간장|ssamjang|쌈장|fish sauce|anchovy sauce|tuna sauce|액젓|멸치액젓|까나리|vinegar|식초|sesame oil|참기름|perilla oil|들기름|salt|소금|pepper(?!.*spray|.*snack|.*chips)|후추|dressing|드레싱|oyster sauce|굴소스|다시다|국간장|양념장|mayonnaise|mayo|마요네즈|wasabi|와사비|hot sauce|핫소스|pasta sauce|marinade|마리네이드|양념소스|ketchup|케첩|mustard|겨자|steak sauce|maple syrup|syrup(?!.*snack|.*chips)|시럽|flavor enhancer|미원|chili oil|고추기름|chili sauce|bbq sauce|peanut butter|oil(?!.*snack)|식용유|cooking oil|canola oil|olive oil/i },

  // Fresh Produce — 진짜 신선식품만
  { type:"Korean Food > Fresh Produce",
    rx:/친환경|유기농|무농약|fresh vegetable|fresh fruit|fresh produce|야채|채소|과일|bean sprouts|mung bean sprouts|콩나물|숙주|깻잎|perilla leaf|치커리|상추|배추|오이|미나리|쑥갓|브로콜리|토마토|양파|마늘|애호박|zucchini|당근|carrot|감자(?!.*chip)|potato(?!.*chip|.*starch|.*flour)|고구마(?!.*chip|.*snack)|sweet potato(?!.*chip|.*snack)|fresh ginger|생강|wild thistle|곤드레|엉겅퀴|chives|쪽파|부추|leek|taro|mushroom(?!.*snack|.*chip)|버섯(?!.*스낵|.*칩)|tofu|두부|fresh\s+(?:apple|grape|orange|lemon|pear|blueberr|strawberr|melon|watermelon|mango)|GAP.*(?:berry|fruit|apple|grape)|chili pepper|chilli pepper|청양고추|고추(?!.*sauce|.*oil|.*paste)|kale|organic greens|burdock|purslane|organic.*salad.*mix|european.*salad.*mix|soft.*mix.*salad|salad.*100g|fresh.*tomato|tomato.*fresh|premium.*tomato|\bdaejeo\b|\btomatoes\b(?!.*sauce|.*paste|.*ketchup)|\bgrapes\b(?!.*wine|.*juice|.*seed.*extract|.*mask)|black.*grape|green.*grape|shine.*muscat|fresh.*grape|premium.*grape|domestic.*grape|imported.*grape/i },

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
    rx:/face cleanser|cleanser(?!.*powder|.*food)|foam cleanser|face toner|toner(?!.*food)|face serum|serum(?!.*hair|.*food)|gel lotion|겔로션|moisturizer(?!.*food)|facial cream(?!.*cake|.*food)|cream(?!.*body|.*cake|.*ice|.*pie|.*food|.*치즈|.*크림빵)|face lotion|ampoule(?!.*food)|facial essence(?!.*cooking|.*food)|essence(?!.*hair|.*cooking|.*food|.*vanilla|.*lemon|.*almond|.*mint|.*extract|.*oil|.*flavor|.*요리|.*식품|.*향신)|soothing pads?|진정패드|trouble pads?|acne pads?|pact|skincare(?!.*hair)|facial mist|hydrating mist|soothing mist|thermal.*mist|cleansing pad|cleansing gel|derma.*pad|trouble.*pad|soothing.*pad|toner.*pad/i },
  // Baby Care — 강화
  { type:"Baby & Kids > Baby Care",
    rx:/baby|infant|newborn|toddler|baby lotion|baby shampoo|baby wash|baby cream|baby oil|baby powder|baby wipe|baby toothpaste|baby toothbrush|floatie|infant formula|baby formula|follow.?up formula|stage\s*[123]\s+formula|newborn formula|milk powder(?!.*protein)|baby bib|burp cloth|baby bottle|baby nipple|pacifier|teether|baby swim|baby float|diaper|기저귀|아기로션|물티슈(?!.*일반)|젖병|분유|유아용|신생아|아기|베이비|아동용/i },
  { type:"Baby & Kids > Toys & Games", rx:/장난감|블록(?!.*수납)|퍼즐(?!.*성인)|보드게임|toy|building block|coloring book|step stool.*toddler|toddler.*step stool|toddler.*footrest|foam.*bat.*kids|soft.*bat.*kids|bubble gun|bubble.*set(?!.*bath|.*skin)|\bwater gun\b|\bwater.*toy\b|\bplay.*set\b.*kids|\bkids.*play.*set\b|outdoor.*play.*set|animal.*toy.*set/i },
  { type:"Pet Supplies",               rx:/hamster|\brabbit food\b|\bbird food\b|\bbird.*feed\b|guinea pig|dog food|cat food|dog treat|pet food|cat treat|강아지사료|고양이사료|반려동물|펫푸드|강아지간식|pet meal|pet.*supplement|rabbit.*side dish|dog.*treat|cat.*treat|pet.*snack/i },
  { type:"Stationery & Office",
    rx:/ballpoint pen|pencil|eraser|scissors|tape|notebook(?!.*laptop)|marker|stapler|refill(?!.*pack)|ink cartridge|pen refill|marker refill|watercolor|paintbrush|brush set|art supply|볼펜|연필|지우개|가위|테이프|노트(?!북 컴퓨터)|형광펜|포스트잇|크레용|크레파스|스테이플러|리필|잉크|wrapping paper|\bsticker set\b|\bsticker.*collection\b|pixel.*sticker|gift wrap|\bstationery\b(?!.*skin)|stationery.*set|writing.*set|school.*supplies.*set/i },
  { type:"Automotive",
    rx:/car air freshener|car diffuser|car shampoo|car wash|car wax|car neck pillow|car cup holder|car sunvisor|car seat|car drying|car hanging|car armrest|car towel|motorcycle|windshield|washer fluid|wiper|tire|vehicle|automotive|자동차|차량용|카샴푸|카워시|선바이저|오토바이/i },
  { type:"Fashion > Hats",
    rx:/baseball hat|baseball cap|sun cap|bucket hat|mesh cap|long.brim.*cap|brim.*hat|foldable.*cap|summer.*hat|sport.*cap|running.*cap|trucker.*cap/i },
{ type:"Fashion > Bags",
    rx:/\bbackpack\b|\btote bag\b|\bhandbag\b|crossbody bag|shoulder bag|\bwallet\b(?!.*app|.*pay)|\bpurse\b|\bclutch\b(?!.*purse.*alt)|messenger bag|gym bag|\bduffle\b/i },
{ type:"Fashion > Socks & Hosiery",
    rx:/\bsocks?\b(?!.*puppet)|\bhosiery\b|\bstockings?\b|\btights\b(?!.*yoga)|compression sock|ankle sock|knee high sock|no show sock/i },
{ type:"Fashion > Accessories",          rx:/가방|지갑|모자|벨트|액세서리|bag(?!.*tea)|sunglasses|안경|선글라스|hair.*clip|hair.*snap.*clip|snap clip|hair pin|\bhair tie\b|hair band(?!.*yoga)|scrunchie|\bbarrette\b|머리핀|헤어핀|머리띠/i },
  { type:"Sports & Outdoors > Golf",                  rx:/golf|골프/i },
  { type:"Sports & Outdoors > Swimming",              rx:/수경|킥판|수영모|swim goggles|kickboard|swim cap/i },
  { type:"Sports & Outdoors > Outdoor & Camping",     rx:/텐트|침낭|캠핑|랜턴(?!.*무드)|camping|sleeping bag/i },
  { type:"Sports & Outdoors > Exercise & Fitness",    rx:/dumbbell|yoga mat|resistance band|pilates|덤벨|요가|필라테스|운동밴드|폼롤러/i },
  { type:"Home & Living > Kitchenware",
    rx:/\bspatula\b|\bscraper\b(?!.*ice|.*car)|flexible.*turner|cooking.*spatula|stainless.*whisk|\bladle\b|shaved ice bowl|oatmeal plate|dinner plate|frying pan|rice cooker|kitchen knife|chopsticks?\b|cutting board|\bpasta bowl\b|ceramic.*bowl|melamine.*bowl|\bceramic.*dish\b|tableware|냄비|프라이팬|도마|주방칼|밀폐용기|락앤락|주전자|젓가락|강판|그라인더|그릇\b|cookware.*set|kitchen.*utensil.*set|stainless.*\d.piece.*set(?!.*bath)/i },
  { type:"Home & Living > Household Supplies",
    rx:/toilet paper|trash can|waste bin|\btissue\b|wet wipe(?!.*car)|floor mat|bath mat|doormat|non-slip.*mat|cable tie|화장지|청소포|탈취|쓰레기통|휴지통|\b매트\b/i },
  // Home Interior — seat cushion/방석 추가
  { type:"Home & Living > Home & Interior",
    rx:/인테리어|가구|seat cushion|chair cushion|sofa cushion|방석|소파 쿠션|의자 쿠션|쿠션 커버|수납|담요|홈데코|blind|roller screen|artificial tree|stool|shoe horn|organizer|storage box|hook|hanger(?!.*clothes)|걸이|행거|\btable cover\b|ramie.*fabric|moshi.*fabric|traditional.*table.*mat|\btable runner\b/i },
  { type:"Flowers & Gifts",  rx:/비누꽃|조화|프리저브드|soap flower|꽃다발|\bbouquet\b|선물세트|gift set|peony|preserved flower|flower.*arrangement|arrangement.*flower/i },
  { type:"Other",        rx:/\$1.*bakery|\$1.*korea|1달러.*베이커리/i },
];


const FOOD_W = /(\d+(?:\.\d+)?)\s*(g|ml)\s*[,，x×*]\s*(\d+)\s*(개|팩|봉|캔|병|박스|세트)?/i;

// ── 절대 우선 차단 (카테고리 오염 방지) ─────────────────────────────────────
// ── 차단 룰 ─────────────────────────────────────────────────────────────────
const BLOCK_RULES = [
  { block:"Beauty > Skincare",
    rx:/\bsauce\b|\bfood\b|ramen|snack|cake(?!.*face|.*pack)|pie\b|bread|kimchi|\bsoup\b|\bstock\b(?!.*ings)|cooking|baking|seasoning|detergent|laundry|kitchen|utensil|toothbrush|toothpaste|\bdental\b|body cream|body lotion|body wash|hand cream|\bshampoo\b|\bconditioner\b|correction tape|pen pouch|cabin filter|scorched rice|roasted.*rice(?!.*extract)|\binsole\b|carbon.*fiber.*insole|seaweed salad|frozen.*grain|grain.*frozen|lucky pouch|\bfoundation\b|cushion.*foundation|\bbb cream\b|\bcc cream\b|\bconcealer\b|\bprimer\b|\blipstick\b|\blip gloss\b|\blip tint\b|\blip balm\b|\beyeshadow\b|\beye shadow\b|\beyeliner\b|\bmascara\b|\bblush\b(?!.*skin)|\bblusher\b|\bhighlighter\b|\bcontour\b|\bshading\b|setting powder|setting spray|makeup base|cover pact|tone up cream|air cushion|\bpact\b(?!.*vitamin)|makeup(?!.*remover)|파운데이션|립스틱|아이섀도|마스카라|컨실러|\bnecklace\b|\bkeyring\b|folding fan|feather fan|tassel charm|\binsole\b|knee.*brace|knee.*support|incontinence|fruit.*tea|honey.*tea|wrapping paper|\bgalchi\b|\bcucumber\b|\bonion\b(?!.*dip)|spatula|\bscraper\b|sticker.*set|table cover|ramie|bubble gun|bubble.*solution.*(?:kids|outdoor|play)|water gun|outdoor.*play.*set|\balbumin\b(?!.*face|.*skin)|\beaa\b(?!.*skin)|scorched rice|nurungji|동전육수|secret coin|\bpowder\b.*(?:supplement|jar)(?!.*setting|.*compact)|garcinia(?!.*cream|.*serum|.*mask)|\bcatechin\b.*tablet|weight management.*(?:tablet|capsule)|fresh.*(?:grape|apple|tomato|peach|mango|berry)|\d+\s*tablets?\b.*\d+\s*capsules?\b|tablets.*capsules/i },
  { block:"Korean Food > Fresh Produce",
    rx:/chips|snack|jelly|porridge|cake|pie|cookie|cracker|\bdrink\b|\bjuice\b(?!.*lemon)|roasted|dried(?!.*herb)|frozen(?!.*vegetable|.*veggie|.*veg\b)|instant|\bpowder\b|\bblend\b|ready.to.eat|fried rice|rice ball|볶음밥|\bsoup\b|\bstew\b(?!.*cut)|hangover|broth|\bmiso\b/i },
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
  if (/sun cushion|sun.*cushion/.test(t))
    return "Beauty > Sun Care";
  if (/foundation|\bbb\b|\bcc\b|makeup|cover|concealer|팩트|파운데이션|메이크업|air cushion/.test(t))
    return "Beauty > Makeup";
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

// ── FOOD 강제 분류 함수 (food-first 블록에서 호출) ──────────────────────────
function _forceFoodClassify(lower, title="", tags="") {
  // Frozen Food 먼저
  if (/\bfrozen\b(?!.*yogurt|.*berry(?!.*soup)|.*fresh)/i.test(lower) &&
      /meal|rice|dumpling|cutlet|seafood|vegetable|veg\b|veggie|shrimp|pork|beef|chicken|wing|steak|spinach|garlic|squid|fish|bibimbap|stir.fried/i.test(lower)) {
    return { type: "Korean Food > Frozen Food", src: "force-frozen" };
  }
  // Refrigerated
  if (/(?:pork|beef|duck|chicken|lamb).*(?:cut|chilled|boneless|stew cut)|(?:chilled|refrigerated).*(?:pork|beef|meat)/i.test(lower) ||
      /marinated.*(?:pork|beef|chicken|bulgogi|galbi)/i.test(lower)) {
    return { type: "Korean Food > Refrigerated Foods", src: "force-refrig" };
  }
  // Beverages
  if (/\bjuice\b(?!.*eye|.*lens)|cold brew|probiotic.*drink(?!.*tablet|.*capsule)|aloe.*drink|\bilohas\b|capri.*sun|flavored.*water(?!.*lotion)|energy drink|sports.*drink(?!.*supplement)|fruit.*tea.*(?:collection|set|pack)|honey.*tea(?!.*mask)|assorted.*tea(?!.*supplement)|\bcoffee\b.*(?:\d+ml|pack of|bottles?)|\bmilk\b.*(?:pack of \d+|\d+ml.*pack|mini.*pack|bottles?.*\d+)|herbal.*drink|\bdrink\b.*\d+ml|\bdrink\b.*(?:pack of \d+|\d+.*bottles?)/i.test(lower)) {
    return { type: "Korean Food > Beverages", src: "force-bev" };
  }
  // Soup → Packaged Foods
  if (/\bsoup\b|hangover.*soup|instant.*soup|cream.*soup|miso.*soup|yukgaejang|seaweed.*soup(?!.*powder)|beef.*soup|radish.*soup/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "force-soup" };
  }
  // Ramen & Noodles
  if (/\bramen\b|noodle|\budon\b|\bnaengmyeon\b|medium noodle|wheat noodle|instant noodle/i.test(lower)) {
    return { type: "Korean Food > Ramen & Noodles", src: "force-ramen" };
  }
  // Kimchi
  if (/\bkimchi\b|김치/i.test(lower)) {
    return { type: "Korean Food > Kimchi", src: "force-kimchi" };
  }
  // Sauces
  if (/\bsauce\b|soy sauce|\bgochujang\b|\bdoenjang\b|\bkochujang\b|\bdressing\b|\bvinegar\b|\bpaste\b(?!.*tooth)|\bcondiment\b|msg\b|seasoning(?!.*snack)|ajinomoto|miwon|furikake/i.test(lower)) {
    return { type: "Korean Food > Sauces & Condiments", src: "force-sauce" };
  }
  // Snacks (tea 제외)
  if (/snack|\bchips?\b|\bcookies?\b|\bcracker\b|\bcandy\b|\bgummy\b|\bpopcorn\b/i.test(lower)) {
    return { type: "Korean Food > Snacks & Chips", src: "force-snack" };
  }
  // Tea → Beverages
  if (/\btea\b(?!.*tree|.*tree.*oil)/i.test(lower)) {
    return { type: "Korean Food > Beverages", src: "force-tea" };
  }
  // Grains/Beans → Packaged Foods or Fresh Produce
  if (/grain.*mix|multi.grain|잡곡|오곡/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "force-grain-mix" };
  }
  if (/black soybean|seoritae|서리태|검정콩|white soybean|baektae|chickpea|black.eyed pea|kidney bean|soybean|soybeans/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "force-soy" };
  }
  if (/\bmilk\b/i.test(lower) && !/thistle|bath|lotion|formula|protein|baobab|colostrum|hair.*care|hair.*set|shampoo|treatment|conditioner|powder.*shampoo/i.test(lower)) {
    return { type: "Korean Food > Beverages", src: "force-milk" };
  }
  if (/\bgrain\b/i.test(lower) && !/alcohol|skin.*extract/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "force-grain" };
  }
  if (/\bseafood\b/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "force-seafood" };
  }
  if (/vegetable|\bfruit\b(?!.*acid|.*enzyme)/i.test(lower) && !/extract.*skin|skin.*extract/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "force-veg" };
  }
  if (/\bbean\b/i.test(lower) && !/eye.*bag|coffee.*bean.*extract/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "force-bean" };
  }
  // 분류 안되면 null (다음 단계에서 처리)
  return null;
}

function ruleClassify(title="", tags="") {
  const text = `${title} ${tags}`.trim();
  const lower = text.toLowerCase();

  // ════════════════════════════════════════════════════════════════
  // 🛡️ 최상위 안전 체크 (food-first보다 먼저 실행)
  // 복합 키워드 상품 - food 키워드가 있어도 실제로는 non-food
  // ════════════════════════════════════════════════════════════════
  
  // Toothbrush Holder → Household (칫솔걸이 먼저 체크)
  if (/toothbrush.*(?:holder|stand|rack|organizer)|(?:holder|stand|rack).*toothbrush|dental.*organizer/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-tb-holder-top" };
  }
  // Toothbrush/Toothpaste 본품 → Oral Care (food 단어 있어도)
  if (/toothbrush(?:es)?|toothpaste|\bmouthwash\b|dental floss|teeth whitening|whitening kit/i.test(lower)) {
    return { type: "Beauty > Oral Care", src: "rule-oral-top" };
  }
  
  // Frozen Fried Rice (food 단어들이 있어도 무조건 Frozen Food)
  if (/(?:frozen|냉동).*(?:fried rice|chicken.*breast.*(?:rice|pack)|bulgogi.*rice|gourmet.*chicken.*(?:rice|pack)|japchae.*rice|vegetable.*rice)|fried rice.*(?:frozen|냉동)/i.test(lower)) {
    return { type: "Korean Food > Frozen Food", src: "rule-frozen-top" };
  }
  
  // Pet Toys (cat/dog) — 무조건 Pet
  if (/\bcats?\b.*(?:toy|feather|fishing rod|wand|ball|scratcher)|(?:toy|feather|fishing rod|wand|ball).*\bcats?\b|\bdogs?\b.*(?:toy|chew|treat|food|leash|harness)|(?:food|treat).*\bdogs?\b|royal canin|\bnaturepet\b|\bdingdongpet\b|\bpetsmon\b|\bttpet\b|tiger pavilion.*cat|lowyd.*cat/i.test(lower)) {
    return { type: "Pet Supplies", src: "rule-pet-top" };
  }
  
  // Protein 제품 (식품키워드 있어도 Health)
  if (/\b(?:whey|wpi|wpc|isp|casein|bcaa|eaa)\b|protein (?:powder|shake|drink|isolate|concentrate|beverage|bar|factory|supplement)|protein.*factory|factory.*protein|isolate.*protein|protein.*isolate|\bleucine\b|mass gainer|weight gainer|meal replacement shake|colostrum.*protein|goat milk.*protein|protein.*colostrum|\bdeprotein\b|protein.?rich|protein-rich|high protein.*(?:powder|shake|supplement|colostrum)|\bbpi sports\b|optimum nutrition|dymatize|nutricost|calob.*shake|shake.*isolate/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-protein-top" };
  }
  
  // Milk Thistle / Liver supplement
  if (/milk thistle|silymarin|liver.*support/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-milk-thistle-top" };
  }

  // ═══ Infant Formula (Protein/Colostrum 단어 있어도 Baby Care) ═══
  //    colostrum protein이 먼저 잡히지 않도록 formula가 있으면 Baby Care
  if (/infant formula|baby formula|\bformula\b.*(?:stage|newborn|infant|toddler|baby milk)|(?:stage|newborn|infant|toddler).*formula|baby milk powder|hipp organic|similac|enfamil|absolute.*(?:masterpiece|platinum|premium|sanyang|classic).*formula|true (?:mom|mum).*formula|i am mother.*formula|imperial dream.*formula|agisalsang.*formula/i.test(lower)) {
    return { type: "Baby & Kids > Baby Care", src: "rule-formula-top" };
  }

  // ═══ Shampoo/Conditioner/Hair Care 제품 → Hair Care (최상위) ═══
  //    Fashion Accessories / 기타 오인 차단
  if (/\bshampoo\b(?!.*carpet|.*upholstery|.*rug)|\bconditioner\b(?!.*fabric|.*softener|.*air.condition)|hair care.*(?:set|combo|kit|pack|bundle|duo)|hair treatment.*(?:set|combo|pack)|hair tonic|hair essence|hair serum|hair repair|hair coating|hair damage|keratin.*(?:hair|shampoo|treatment)|haircare.*(?:gift|set|combo|duo)|propolis.*(?:damage repair|hair)|hair loss.*(?:shampoo|treatment|tonic)|scalp.*(?:care|tonic|rinse|treatment|shampoo)|kerasys|elastine.*(?:shampoo|conditioner|hair)|aekyung.*hanaro|mise.?en.?scene|milk baobab.*(?:shampoo|treatment|hair)|bioclasse.*(?:shampoo|treatment)|dr\.?rafael.*shampoo|jaysoop.*(?:shampoo|treatment)/i.test(lower) && !/laundry|detergent|capsule.*detergent|wool.*detergent|fabric softener/i.test(lower)) {
    return { type: "Beauty > Hair Care", src: "rule-hair-product-top" };
  }

  // ═══ Baby Shampoo Cap → Baby Care (샴푸 단어 있어도 유아용) ═══
  if (/baby.*shampoo.*(?:cap|shield|visor)|newborn.*shampoo|toddler.*shampoo.*cap/i.test(lower)) {
    return { type: "Baby & Kids > Baby Care", src: "rule-baby-shampoo-top" };
  }

  // ════════════════════════════════════════════════════════════════
  // 📍 추가 안전 체크 — food-first로 인한 오분류 방지 (batch 5/6/기타)
  // ════════════════════════════════════════════════════════════════

  // ── Eye Cream / Eye Patch → Skincare (bean 등 food 키워드 있어도) ──
  if (/eye cream|eye patch|eye\s*(?:gel|mask|serum)(?!.*sleep.*bed)|under.eye.*(?:patch|cream|serum)|dark.circle.*(?:patch|mask|treatment|cream)|dr\.?headison.*eye|lifting.*eye.*cream|auto.*eye.*cream|galvanic.*eye|hebblue.*eye/i.test(lower)) {
    return { type: "Beauty > Skincare", src: "rule-eye-skin-top" };
  }

  // ── 📦 Canned Corn / 통조림 → Packaged Foods ──
  if (/canned corn|sweet corn canned|canned.*(?:tuna|sardine|mackerel|salmon)|통조림|corned beef|spam.*luncheon/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-canned-top" };
  }

  // ── 🌿 산달래/미나리/사게/마늘/양파 등 신선 야채 → Fresh Produce ──
  //    ⚠️ kimchi 단어 있으면 제외 (Kimchi 카테고리로 가야함)
  if (/산달래|wild mountain.*(?:azaleas|lily bulbs|chives)|korean wild mountain|korean sage|fresh.*(?:purple onions?|onions?(?!.*powder|.*dry)|garlic|minari|water parsley|wild chives|crown daisy|ssukgat)|premium.*white.*cucumbers?|korean.*white.*cucumbers?|baek dadagi|white.*pickling.*cucumbers?(?!.*kimchi)|premium stem.only|cheongdo minari|gwangpyeong.*(?:onion|farm)|\bminari\b(?!.*sauce|.*dried)|jeju.*(?:sweet potato|carrot|tangerine)(?!.*pie|.*snack)|organic.*(?:sweet potato|purple yam|chestnut.*sweet potato)/i.test(lower) && !/cream|serum|toner|ampoule|cleanser|\bkimchi\b|pickled|oisobagi|oi sobagi/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-fresh-veg-top2" };
  }

  // ── 🧴 Makeup Cushion / BB-CC Cream → Makeup (Skincare 오인 차단) ──
  if (/\bcushion\b.*(?:foundation|refill|\d+g.*refill|laneige|hanhyunjae|fit)|\bglow cushion\b|\bneo cushion\b|\bcushion compact\b|makeup cushion|air cushion(?!.*skincare)/i.test(lower)) {
    return { type: "Beauty > Makeup", src: "rule-cushion-makeup-top" };
  }
  if (/\bbb cream\b|\bcc cream\b|cover pact|cover.*compact|\bpact\b(?!.*vitamin|.*probio|.*health)|essence.*pact|foundation.*pact|팩트(?!.*비타|.*프로바)/i.test(lower)) {
    return { type: "Beauty > Makeup", src: "rule-bbcc-pact-top" };
  }

  // ── 💊 Multivitamin / Mineral Supplement (All-in-One 허용) → Health ──
  if (/\bmultivitamin\b|\bmulti.?vitamin\b|vitamin.*mineral|all.in.one.*(?:multivitamin|vitamin|supplement)(?!.*detergent|.*skincare|.*hair|.*cushion|.*foundation|.*BB|.*CC)|\bomega.?3\b.*(?:softgel|capsule)|\biron supplement\b|calcium.*magnesium.*(?:zinc|vitamin)|daily.*nutritional.*support|immune.*(?:support|multivitamin)/i.test(lower) && !/\bserum\b|\bcream\b|\btoner\b|\bmask\b|face cleanser|body cream|skincare/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-multivit-all-top" };
  }

  // ── 💊 Capsule 형태 건강보조 → Health (Skincare 오인 차단) ──
  //    ⚠️ Skin1004, Skincare 브랜드 제품은 ampoule/serum/essence/cream/mask면 Skincare
  if (/(?:pumpkin seed|saw palmetto|black maca|probiotic|bifidus|lactobacillus|banaba leaf|olive oil|hemp seed|mugwort|ashwagandha|turmeric|chondroitin|glucosamine|vitamin.*d|vitamin.*c|vitamin.*b|omega.?3|iron.*supplement|calcium.*magnesium).*(?:capsules?|tablets?|softgels?|extract.*tablets?|supplement)(?!.*cream|.*serum|.*mask|.*patch|.*ampoule|.*essence|.*toner|.*cleans|.*moistur)/i.test(lower) && !/skin1004|skincare|\bampoule\b|centella.*cica|madagascar.*centella/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-supp-capsule-top" };
  }

  // ── 💧 Skin1004 / Centella / Madagascar 스킨케어 → Skincare ──
  if (/skin1004|madagascar centella|\bcentella\b.*(?:ampoule|essence|serum|cream|toner|mask|cica|probiotic)|probiotic.*(?:ampoule|essence|serum|mask)|probiotic mask(?!.*supplement)|firstlab.*probiotic.*mask|advanced.*skincare/i.test(lower)) {
    return { type: "Beauty > Skincare", src: "rule-skin1004-top" };
  }

  // ── 🪰 Pest Control / 벌레퇴치 → Household ──
  if (/pop.?up.*eye trap|eye trap|pest control|fly trap|mosquito.*(?:trap|repellent|killer)|cockroach.*(?:trap|killer)|insect.*(?:trap|killer|repellent)/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-pest-top" };
  }

  // ── 🚿 Bathroom Accessories / Shower Head → Household ──
  if (/bathroom accessories|stainless steel.*bathroom|shower head|shower.*hose|water.?saving shower|wall.mount.*(?:outlet|socket|hook)|plug holder|razor holder|razor.*mount|toothpaste holder|toothpaste.*organizer|bathroom.*organizer|magnetic hook/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-bathroom-top" };
  }

  // ── 💇 Hair Care Gift Set → Hair Care (Gift/Flowers 오인 차단) ──
  if (/(?:milk baobab|mise.?en.?scene|kerasys|elastin|nard|dove).*hair care.*(?:set|gift set|pack)|hair care.*gift set|shampoo.*conditioner.*(?:gift|set|pack)|hair treatment.*(?:gift|set)/i.test(lower)) {
    return { type: "Beauty > Hair Care", src: "rule-hair-giftset-top" };
  }

  // ── 🎁 Fridge Magnet / Traditional Gifts → Flowers & Gifts ──
  if (/fridge magnets?|decorative.*cultural|character.*fridge|korean traditional.*(?:magnet|souvenir|gift|mini|charm|norigae|folding fan|ink wash)|traditional.*hanbok.*(?:magnet|mini|souvenir)|laveque.*traditional|suryu.*norigae|handmade oriental|lucky pouch|traditional.*floral.*pouch|lunar new year.*pouch|korean floral.*(?:pouch|gift)|pressed flower.*bookmark|mother.of.pearl.*(?:mirror|accessory)(?!.*car)|handpicked.*suryeo|jade bead/i.test(lower)) {
    return { type: "Flowers & Gifts", src: "rule-gift-top" };
  }

  // ── 📦 Food Storage Container → Kitchenware ──
  if (/food storage container|storage container.*(?:airtight|food|bpa|durable)|meal prep.*container|sealing clip.*food|bag clips.*food storage|lotte elife.*storage/i.test(lower)) {
    return { type: "Home & Living > Kitchenware", src: "rule-storage-container-top" };
  }

  // ── 🧸 Baby Doll / Rattle Teether / Sand Play → Baby Toys ──
  if (/baby doll|mini bath play.*doll|doll.*(?:baby|infant).*play|rattle teether|bear storage.*rattle|baby safe.*plush|plush animal.*toy|sand play|sand toys|silicone sand|jam jam.*rattle|baby rattle|pom pom toy|cotton candy.*pom pom|kids.*play accessory|kids toy|soft fluffy.*kids|sensory toy.*kids|squishy.*(?:toy|kit)|stem.*(?:building|toy)|dinosaur model kit|rocket.*flying toy|cup stacking toy|slime.*sensory|butter slime|bubble gun.*kids/i.test(lower)) {
    return { type: "Baby & Kids > Toys & Games", src: "rule-baby-toy-top" };
  }

  // ── 🏃 Sports Hip Pack / Running Belt → Sports ──
  if (/running belt|hip pack.*(?:running|marathon|cycling|hiking|sports)|sports.*hip pack|marathon.*(?:pouch|bag|belt)|cycling.*(?:pouch|bag|belt)|waist pack.*(?:sports|running|hiking)/i.test(lower)) {
    return { type: "Sports & Outdoors > Exercise & Fitness", src: "rule-sports-belt-top" };
  }

  // ── 🍬 양갱 (Yanggaeng) / 한과 → Snacks (Fashion Accessories 오인) ──
  if (/yanggaeng|양갱|유과|yukwa|강정|gangjeong|hangwa|tangerine.*pie|jeju.*pie|rice snack.*wrap|tangerine.*glutinous|peanut rocher/i.test(lower) && !/pouch|gift box|hair|skin/i.test(lower)) {
    return { type: "Korean Food > Snacks & Chips", src: "rule-yanggaeng-top" };
  }

  // ── 🥢 김장/피클/절임 → Banchan (Fashion 오인) ──
  if (/pickled.*(?:salad|cabbage|radish|vegetable|wild cabbage|mustard)(?!.*kimchi)|무짱아찌|오이지|장아찌|jangajji|kangkyung.*pickled|sinan.*pickled/i.test(lower)) {
    return { type: "Korean Food > Banchan", src: "rule-pickled-banchan-top" };
  }

  // ── 🌿 곤드레/Thistle Leaves / Korean Wild Greens → Packaged ──
  if (/geongondre|gondre|thistle leaves|wild korean.*(?:leaves|greens)|korean thistle|dried.*(?:leaves|greens|seasonal vegetables|native wild vegetables|wild vegetables|mountain herb|natural dried greens)|jeju dambit.*dried|dambit.*dried/i.test(lower) && !/\bfresh\b.*greens/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-gondre-top" };
  }

  // ── 🍚 Cooked Rice / Oat Rice / Rice with Vegetables → Packaged Foods ──
  if (/cooked rice.*vegetables?|cooked rice.*\d+g|rice with vegetables|rice with beef|oat rice(?!.*snack)|canadian oats?.*(?:\d+kg|single pack)|\brolled oats?\b|baeksul cooked rice|\d+.grain.*(?:rice pack|mixed rice|multigrain rice)|uncle tak.*(?:oat|grain|mixed|song)|song.*set.*grain|mixed.*\d+.?song|mixed.*26 varieties|nongbu gokgan.*oats?|pavavin|pavabin/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-cooked-rice-top" };
  }

  // ── 🫚 Korean Dried Seaweed (조미김/반찬김) → Banchan ──
  if (/jinhandasi|dried seasoned seaweed|roasted seasoned seaweed|kim jaban|traditional.*seaweed flakes|seaweed snack.*banchan|furikake.*nori(?!.*japan|.*ohmi)|\bgim jaban\b|조미김/i.test(lower)) {
    return { type: "Korean Food > Banchan", src: "rule-kim-banchan-top" };
  }

  // ── 🫖 Extract Drink with Chicken Feet/Red Ginseng → Health ──
  //    (일반 herbal tea / herbal drink는 Beverages로)
  if (/red ginseng.*(?:drink|stick|extract).*(?:supplement|immunity|vitality|premium)|deer antler.*(?:ginseng|drink|extract)|achyranthes.*extract|chicken feet.*extract|\bhealth tonic\b|immunity.*stick|traditional sweets.*red ginseng|red ginseng.*traditional sweets/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-health-tonic-top" };
  }
  // herbal drink 단독은 Beverages
  if (/\bherbal drink\b|\bherbal tea\b|\bjuice\b.*\d+ml.*bottles?|probiotic drink.*\d+ml/i.test(lower) && !/supplement|extract.*health|deer antler|red ginseng/i.test(lower)) {
    return { type: "Korean Food > Beverages", src: "rule-herbal-drink-top" };
  }

  // ── Body Cream / Body Lotion → Body Care (car 단어 있어도) ──
  //    BougCarnie 같은 브랜드명에 "carni"가 있어 Automotive로 오인 방지
  if (/body cream|body lotion|body butter|bougcarnie|bouquet garni|\bbody\b.*cream.*moisturiz|deep nourishing.*body/i.test(lower)) {
    return { type: "Beauty > Body Care", src: "rule-body-cream-top" };
  }

  // ── 🧴 Facial Mist / Skincare Mist → Skincare (Other 오인 방지) ──
  if (/facial mist|calming mist|hydrating mist|soothing mist|skincare.*mist|\bmist\b.*(?:spray|hydrat|soothing|calming|skin|face|brightening|glutathione|spot|blemish|madecassoside|cicapair|sensitive skin)|glutathione mist|madecassoside mist|spot.*mist.*blemish|avene.*thermal.*mist|uriage.*mist|dr\.?jart.*mist|eunyul.*mist|medbee.*mist/i.test(lower)) {
    return { type: "Beauty > Skincare", src: "rule-mist-top" };
  }

  // ── 🥜 Korean Grain Sets / Uncle Tak / Pavavin → Packaged Foods ──
  if (/uncle tak|pavavin|pavabim|pavabin|thedam.?eun.*millet|glutinous millet|nutty millet|mixed.*\d+ varieties|mixed.*\d+.?song.*set|nutty and delicious millet|mom.?s kitchen.*grain|\bmillet\b.*(?:kg|pack)|daegu.*millet|rich flavor king banana|banana\s*$/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-grain-misc-top" };
  }

  // ── 🫒 MCT Oil / Coconut Oil 건강보조 → Health ──
  if (/\bmct oil\b|medium chain triglyceride|coconut mct|lauric.*coconut|coconut oil.*(?:\d+ml|energy|metabolism|wellness)/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-mct-top" };
  }

  // ── 🍬 Haribo / Fun Mix Gummies → Snacks ──
  if (/\bharibo\b|fun mix gummies|gummy candy.*\d+g|gummies.*pack|\bgummy\b.*(?:bear|worm|fruit)/i.test(lower)) {
    return { type: "Korean Food > Snacks & Chips", src: "rule-gummies-top" };
  }

  // ── 🏊 Ice Cooling / Cold Pad → Other (health support) ──
  if (/ice cooling.*(?:sheet|pad|pack|pillow)|cooling sheet.*(?:neck|body)|냉찜질|duralon.*cooling|manito.*cooling|neck pillow.*cooling/i.test(lower)) {
    return { type: "Sports & Outdoors > Exercise & Fitness", src: "rule-cooling-top" };
  }

  // ── 🦟 Bug Shield / Mosquito Band → Outdoor ──
  if (/bugs?\s*shield|mosquito band|bug.*band|midchu.*bugs?|kc certified.*(?:band|bugs?|repellent)|mosquito.*(?:repellent|wristband|patch)/i.test(lower)) {
    return { type: "Sports & Outdoors > Outdoor & Camping", src: "rule-bugshield-top" };
  }

  // ── 🏃 Sports Towel / Wet Towel → Sports ──
  if (/wet sports towel|quick.?dry.*towel.*exercise|microfiber.*towel.*exercise|sports.*towel.*(?:quick|absorbent)|wonie.*sports towel|sports towel set/i.test(lower)) {
    return { type: "Sports & Outdoors > Exercise & Fitness", src: "rule-sport-towel-top" };
  }

  // ── 💪 Germanium Power Bracelet / Health Bracelet → Health ──
  if (/germanium.*bracelet|prostate energy|health bracelet.*(?:vitality|wellness|men)|energy booster.*bracelet/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-germanium-top" };
  }

  // ── 📻 Radio / Electronics → Other (Home & Interior) ──
  if (/medium wave radio|portable radio|eco.?friendly.*radio|\bradio\b.*(?:korea|portable|wave)/i.test(lower)) {
    return { type: "Home & Living > Home & Interior", src: "rule-radio-top" };
  }

  // ── 🧳 Travel Toiletry / Personal Care Kit → Household ──
  if (/travel toiletry kit|toiletry kit|personal care set.*(?:travel|portable|grooming)|mini travel.*kit.*grooming|portable.*grooming.*(?:set|kit)/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-toiletry-top" };
  }

  // ── 🔨 Water Play Hammer / Kids Water Toys → Toys ──
  if (/water play.*(?:pvc|hammer|bopping|toy)|bopping hammer|minhwa shop.*water|\bpvc\b.*(?:hammer|bopping|play)/i.test(lower)) {
    return { type: "Baby & Kids > Toys & Games", src: "rule-water-toy-top" };
  }

  // ── 🧶 Yarn / Knitting Supplies → Stationery/Hobby ──
  if (/\byarn\b.*(?:knitting|crochet|faux fur)|faux fur yarn|knitting.*yarn|crochet.*supplies|brand yan.*yarn/i.test(lower)) {
    return { type: "Stationery & Office", src: "rule-yarn-top" };
  }

  // ── 🐟 명란젓 / 절임 → Banchan ──
  if (/명란|pollack roe|marinated pollack|spicy marinated.*roe|jidopyoseong.*roe|salted.*fish.*roe/i.test(lower)) {
    return { type: "Korean Food > Banchan", src: "rule-pollack-top" };
  }

  // ── 📒 Sketchbook / Drawing Paper → Stationery ──
  if (/sketchbook|sketch.*pad|drawing paper|exploration.*sketchbook|gsm.*drawing|artist.*paper/i.test(lower)) {
    return { type: "Stationery & Office", src: "rule-sketchbook-top" };
  }

  // ── Business Card / Greeting Card → Stationery/Gifts ──
  if (/business card.*(?:holder|case)|greeting card|card set|patchwork card|card holder.*(?:traditional|korean|craft)|mother.of.pearl.*(?:business|card)/i.test(lower)) {
    return { type: "Flowers & Gifts", src: "rule-cards-top" };
  }

  // ── 🚗 Motorcycle / Scooter Parts → Automotive ──
  if (/forza \d+|pcx\s*\d+|nmax|side stand.*extension|kickstand.*footrest|footrest set.*motorcycle|motorcycle.*(?:stand|part|accessory)|scooter.*(?:stand|part|accessory)|leather.*dust remover.*cars?|bullsone.*leather/i.test(lower)) {
    return { type: "Automotive", src: "rule-moto-top" };
  }

  // ── 📝 Back-to-School Stationery / Doodle Pen → Stationery ──
  if (/back.?to.?school.*stationery|stationery.*(?:set|gift set)|javapen|doodle pen|water.?erase.*pen|all.in.one.*stationery|mechanical pencil.*eraser|animal.?shaped.*pen|mess.?free.*drawing pen/i.test(lower)) {
    return { type: "Stationery & Office", src: "rule-stationery-top2" };
  }

  // ── 🧂 Sesame Oil Seaweed (Korean 조미김) → Banchan ──
  if (/sesame oil seaweed|roasted.*seaweed.*(?:4g|oil)|sesame.*oil.*laver|perilla.*oil.*seaweed.*sheets/i.test(lower)) {
    return { type: "Korean Food > Banchan", src: "rule-sesame-seaweed-top" };
  }

  // ── 🍜 Ramen Cooking Sauce → Sauces (Ramen 오인 차단) ──
  if (/ramen.*cooking sauce|shio ramen.*sauce|ramen.*base|noodle.*base.*bottle/i.test(lower)) {
    return { type: "Korean Food > Sauces & Condiments", src: "rule-ramen-sauce-top" };
  }

  // ── 🥛 Wool/Special Laundry Capsules (shampoo 이름 헷갈림) → Cleaning ──
  if (/wool shampoo.*capsule detergent|wool.*detergent.*capsule|baby shampoo cap(?!.*hair)/i.test(lower)) {
    if (/baby shampoo cap/i.test(lower)) {
      return { type: "Baby & Kids > Baby Care", src: "rule-baby-shampoo-cap-top" };
    }
    return { type: "Home & Living > Cleaning Supplies", src: "rule-wool-cap-top" };
  }

  // ── 🍹 Cider Soda / Carbonated → Beverages ──
  if (/cider soda|cider.*\d+ml|zero calorie.*soda|\bsprite\b|\bpepsi\b|\bcoca.?cola\b|\bfanta\b|carbonated drink|sparkling (?:water|drink)/i.test(lower)) {
    return { type: "Korean Food > Beverages", src: "rule-soda-top" };
  }

  // ── 🍚 Instant Udon/Noodle → Ramen & Noodles (Packaged 오인) ──
  if (/instant noodles?(?!.*soup block|.*seasoning)|udon noodles?|hururuk.*noodle|spicy tempura.*udon|kalguksu.*noodle bowl/i.test(lower)) {
    return { type: "Korean Food > Ramen & Noodles", src: "rule-instant-noodle-top" };
  }

  // ── 🥩 Frozen Meat/Tteokbokki Pack → Frozen ──
  if (/hanwoo.*(?:frozen|boneless)|frozen.*(?:short rib|beef|pork|chicken|tteokbokki|rice cake).*(?:pack|g\b|kg\b)|\bfrozen\b.*tteokbokki|mimine.*frozen|\btteokbokki.*frozen\b|original soup tteokbokki.*frozen|\d+g.*frozen/i.test(lower)) {
    return { type: "Korean Food > Frozen Food", src: "rule-frozen-meat-top" };
  }

  // ── 🥩 Refrigerated Beef / 한우/돼지고기 → Refrigerated ──
  if (/(?:hanwoo|korean beef).*(?:premium|grade|\d+\s*kg|chilled)(?!.*frozen|.*sauce|.*broth|.*powder|.*supplement)|ajuzone.*korean beef|korean beef.*premium gold/i.test(lower)) {
    return { type: "Korean Food > Refrigerated Foods", src: "rule-refrig-beef-top" };
  }

  // ── 🧴 Damaged Hair Serum / Hair Essence → Hair Care ──
  if (/hair serum|hair essence|hair.*(?:repair|damage).*serum|damaged hair.*(?:serum|clinic|treatment)|intensive repair.*hair|argan.*baobab.*hair/i.test(lower)) {
    return { type: "Beauty > Hair Care", src: "rule-hair-serum-top" };
  }

  // ── 🌾 Wheat Flour / Grain 가루 → Packaged ──
  if (/wheat flour|emmer wheat|buckwheat flour|rice flour|corn flour|\bflour\b.*\d+\s*kg|\bflour pack\b|multigrain mix.*\d+\s*kg/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-flour-top" };
  }

  // ── 🐰 Pet Dog Bowl Table → Pet Supplies ──
  if (/dog bowl|double bowl.*dog|dog feeder|cat feeder|dog food bowl|pet bowl.*table|explorer dog/i.test(lower)) {
    return { type: "Pet Supplies", src: "rule-pet-bowl-top" };
  }

  // ── 💅 Hair Snap Clip / Hairpin → Fashion Accessories ──
  if (/hair snap clip|hair.?pin|hair clips?|hair band(?!.*yoga|.*sweat)|hair tie|ribbon.*hair|oval.*hair|square.*hair.*clip/i.test(lower) && !/dye|color|shampoo|treatment/i.test(lower)) {
    return { type: "Fashion > Accessories", src: "rule-hairpin-top" };
  }


  // ── Hair Color / Hair Dye → Hair Care (bean/콩 brand 이름 오인) ──
  if (/hair.*(?:color|dye|coloring|colorant)|color.*cream.*hair|gray.*hair.*(?:dye|color)|hair dye.*cream|black hair.*(?:secret|dye)|foam.*hair.*(?:dye|color)|bubble.*hair.*(?:dye|color)|흰머리.*염색|염색약|cellribone.*hair|squid ink.*hair|mise.?en.?scene|\bliese\b(?!.*shampoo)|\blien\b.*(?:dye|color|hair)/i.test(lower) && !/shampoo|conditioner.*set/i.test(lower)) {
    return { type: "Beauty > Hair Care", src: "rule-hair-dye-top" };
  }

  // ── Car Cabin Filter → Automotive (pm2.5 activated carbon 등) ──
  if (/cabin filter|car.*air.conditioner.*filter|car air.*filter|vehicle.*filter|pm2\.5.*car|\bbendict\b.*(?:car|filter|cabin)|activated.*carbon.*(?:car|cabin|vehicle)|car.*(?:cabin|air).*filter|차량.*필터|캐빈.*필터/i.test(lower)) {
    return { type: "Automotive", src: "rule-cabin-filter-top" };
  }

  // ── Car Air Freshener / Perfume Sachet for Car → Automotive ──
  if (/car.*(?:air.*freshener|diffuser|perfume.*sachet|interior.*freshener|ornament|charm(?!ing))|perfume.*sachet.*car|\brooptang\b.*car|car.*(?:freshener|scent)|car.*(?:tissue box|dashboard)|vehicle.*interior.*(?:freshener|accessory|decor)/i.test(lower)) {
    return { type: "Automotive", src: "rule-car-accessory-top" };
  }

  // ── Teeth Whitening Kit / Gel → Oral Care (Hair Care 오인) ──
  if (/teeth whitening|dental bleaching|professional.*whitening|whitening kit|whitening.*(?:gel|powder)|briol.*homme.*teeth|whitening.*booster.*patch.*teeth|oral.*bleaching/i.test(lower)) {
    return { type: "Beauty > Oral Care", src: "rule-whitening-top" };
  }

  // ── 세제 캡슐 → Cleaning Supplies (Household/Skincare 오인 차단) ──
  if (/detergent capsule|capsule detergent|laundry (?:capsule|pod)|washing pod|세탁캡슐|캡슐세제|laundry.*detergent.*capsule|skin.?friendly.*detergent/i.test(lower)) {
    return { type: "Home & Living > Cleaning Supplies", src: "rule-detergent-top" };
  }

  // ── Massage Ball / Sports Support Band → Sports ──
  if (/massage.*(?:ball|roller|gun|stick)|foam.*roller|trigger.*point|(?:arch|core|wrist|ankle|knee|elbow|back).*support.*band|sports.*(?:band|arch|support)|release.*massage|\byoga mat\b|\bresistance band\b|\bpilates\b(?!.*studio)|trekking.*(?:pole|stick)|stretching.*device.*pain/i.test(lower)) {
    return { type: "Sports & Outdoors > Exercise & Fitness", src: "rule-sport-top" };
  }

  // ── Swim Cap / Goggles → Swimming ──
  if (/swim.*cap|swim.*goggles|swimming.*goggles|anti.fog.*goggles.*swim|waterproof.*swim|swim.*gear|swimming.*gear|수영모|수경(?!.*field)/i.test(lower)) {
    return { type: "Sports & Outdoors > Swimming", src: "rule-swim-top" };
  }

  // ── Vacuum Cleaner → Cleaning Supplies (Stationery/Other 오인) ──
  if (/vacuum cleaner|vacuum.*(?:mini|handheld|cordless|robot|sweeper)|\bvacuum\b.*cleaner|진공청소기|eraser.*vacuum|sprout.*vacuum/i.test(lower)) {
    return { type: "Home & Living > Cleaning Supplies", src: "rule-vacuum-top" };
  }

  // ── 조미김/씨김(seasoned laver) → Banchan (Sauces 오인 차단) ──
  if (/seasoned.*laver.*sheets|laver.*sheets.*(?:perilla|sesame|roasted)|(?:perilla|sesame).*oil.*laver(?:.*sheets)?|roasted.*seaweed.*sheets|김 반찬|재래김|조미김/i.test(lower)) {
    return { type: "Korean Food > Banchan", src: "rule-seasoned-laver-top" };
  }

  // ── Mixed Nuts → Snacks (Household/Other 오인) ──
  if (/mixed nuts|nuts mix|nut mix|assorted nuts|\btrail mix\b|premium.*nut.*(?:pack|bag|can)|견과류 믹스|nutheim|naturdure.*nut|\bmixed nut\b/i.test(lower)) {
    return { type: "Korean Food > Snacks & Chips", src: "rule-mixed-nuts-top" };
  }

  // ── Green Tea Waffles / Tofu Noodle Snack → Snacks (Beverages/Ramen 오인) ──
  if (/green tea.*waffle|tea.*waffle|green tea.*(?:cookie|cracker|biscuit|chocolate|snack)|matcha.*(?:cookie|cracker|waffle|snack)|tofu.*noodle.*snack|tofu.*snack.*protein|noodle.*snack(?!.*ramen)|\bo.?sulloc\b.*waffle/i.test(lower)) {
    return { type: "Korean Food > Snacks & Chips", src: "rule-tea-snack-top" };
  }

  // ── Porridge / Japchae Fried Rice → Packaged Foods ──
  if (/porridge|\bjook\b|abalone porridge|beef porridge|chicken porridge|scorched rice.*porridge|japchae.*fried rice|japchae.*(?:pack|stir.fried|glass noodle)|\bbap club\b|hetbahn.*porridge/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-porridge-top" };
  }

  // ── Dried/Roasted/Powder 콩류/나물 → Packaged Foods (Fresh Produce 차단) ──
  if (/(?:dried|roasted|volumed|볶은|말린|hot air roasted).*(?:bean|chickpea|garbanzo|lentil|soybean|seoritae|서리태|black bean|kidney bean|cranberry bean|lupin bean|fernbrake|bracken|chwinamul|gondre|namul)|(?:bean|chickpea|garbanzo|lentil|soybean|fernbrake|bracken).*(?:dried|roasted|powder|가루)|(?:mixed bean|bean.*bundle|multi.*bean|bean powder|곡물 가루|bean.*flour|pavabin|pa.?ba bean|mixed beans bundle|beans bundle)|\b(?:bean|grain).*powder(?!.*baby|.*foundation|.*compact|.*setting|.*makeup)|dried.*fernbrake|fernbrake.*bracken|healthy.*(?:mixed beans|beans bundle)|(?:kidney|cranberry|round|black).*beans.*(?:bundle|mixed|whole.*pack|pack of \d+)/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-dried-bean-top" };
  }

  // ── Honest Health Juice (Chicken Feet Extract) → Health (아니 건강 추출물) ──
  if (/honest health juice|achyranthes.*extract|chicken feet.*extract|extract.*chicken feet|우슬.*추출|달인물/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-extract-health-top" };
  }

  // ── Ceramic/Kitchenware (noodle bowl, soup bowl 등) ──
  if (/portmeirion|botanic garden.*(?:plate|bowl|dish)|ceramic.*(?:plate|bowl|dish|dinnerware|mug|cup|serving)|dinnerware.*set|tableware.*set|\bchina\b.*(?:plate|dish|bowl|set)|porcelain.*(?:plate|bowl|cup)|melamine.*(?:plate|bowl|dish)|bone china.*(?:bowl|plate)|insulated.*(?:bowl|mug)|vacuum.*insulated.*bowl|stainless.*steel.*(?:bowl|cold noodle bowl|shot glass|cookware|drinkware)|stainless.*\d+.*(?:cm|bowl)|\bsus.?304\b.*bowl|cold noodle bowl|pasta bowl|character.*handle.*bowl|character.*bowl.*set|nonstick.*(?:pan|pot|cookware)|cookware.*set|frying.*pan|(?:noodle|soup|serving|dining|rice).*bowl.*(?:set|ceramic|porcelain|stainless|melamine|character|bpa|4pcs|bone china|set of \d+)|bpa.?free.*(?:bowl|plate|melamine)|shot glass(?!.*soju|.*food)|drinkware|belcremer.*shot glass/i.test(lower)) {
    return { type: "Home & Living > Kitchenware", src: "rule-kitchenware-top" };
  }

  // ── Hair Clips / Hair Accessories → Fashion Accessories ──
  if (/hair.*(?:clip|snap.*clip|snap clips|pin|tie|band(?!.*yoga|.*sweatband)|elastic(?!.*cream)|scrunchie|barrette|headband(?!.*sweat|.*yoga))(?!.*dye|.*color)|snap clip.*hair|square.*hair.*clip|머리핀|헤어핀|머리띠(?!.*운동)/i.test(lower)) {
    return { type: "Fashion > Accessories", src: "rule-hair-acc-top" };
  }

  // ── Sweatband / Helmet Accessories → Sports ──
  if (/\bsweatband\b|helmet.*(?:sweatband|pad|accessory)|(?:sports|exercise).*headband|wrist.*sweat/i.test(lower)) {
    return { type: "Sports & Outdoors > Exercise & Fitness", src: "rule-sweatband-top" };
  }

  // ── Hand Mirror / Decorative Mirror → Flowers & Gifts ──
  if (/hand mirror|mother.of.pearl.*mirror|vanity mirror.*(?:compact|portable)|decorative.*mirror(?!.*car)|traditional.*mirror/i.test(lower)) {
    return { type: "Flowers & Gifts", src: "rule-gift-mirror-top" };
  }

  // ── Multivitamin / Supplement (bio-active, mineral, capsule) → Health ──
  if (/multivitamin|multi.vitamin|vitamin.*mineral|\bprobiotic\b(?!.*drink.*\d+ml)|bifidus|lactobacillus|banaba.*leaf.*extract|corosolic acid|omega.?3.*(?:softgel|capsule|supplement)|\bcollagen.*(?:capsule|tablet|stick|powder|supplement)(?!.*mask|.*cream|.*serum|.*eye)|(?:immune|digestive|joint).*support.*(?:capsule|tablet|supplement)/i.test(lower) && !/body cream|body lotion|skin.*cream|\bfacial\b/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-multivit-top" };
  }

  // ── Back Massager / Stretching Device → Sports ──
  if (/back massager|stretching device|muscle.*stretch|decompression.*back|back.*stretcher|cervical.*stretcher/i.test(lower)) {
    return { type: "Sports & Outdoors > Exercise & Fitness", src: "rule-back-massage-top" };
  }

  // ── Walnut Oil Sticks / Hemp Seed Oil Sticks (식용) → Health or Sauces ──
  if (/walnut oil.*stick|\bhemp seed oil\b.*(?:capsule|softgel|supplement)|flaxseed.*oil.*(?:stick|capsule)|organic.*oil.*stick(?!.*cosmetic|.*skin|.*hair)/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-oil-stick-top" };
  }

  // ── Sports 음료 (O2, 이온음료) → Beverages ──
  if (/\bo2\b.*(?:orange|lemon|flavor).*500ml|o2.*bottle.*pack|sports.*drink.*\d+ml|ion.*drink.*bottle|energy.*water.*pack/i.test(lower)) {
    return { type: "Korean Food > Beverages", src: "rule-sport-drink-top" };
  }

  // ── Anchovies / 멸치볶음 (한식 반찬) → Banchan ──
  if (/spicy.*stir.?fried.*anchovies|anchovies.*stir.?fried|멸치볶음|멸치.*조림|dried anchovies.*seasoned|myeolchi.*bokkeum/i.test(lower)) {
    return { type: "Korean Food > Banchan", src: "rule-banchan-anchovy-top" };
  }

  // ── Glue / Tape / Marker (문구류) → Stationery ──
  if (/adhesive glue tape|glue tape|scotch tape|masking tape|double.?sided tape|amos.*glue|amos.*adhesive|\bhighlighter\b.*(?:pen|marker|stationery)|permanent marker|name pen|sharpie/i.test(lower)) {
    return { type: "Stationery & Office", src: "rule-stationery-glue-top" };
  }

  // ── Mint Candy / Anytime Mint → Snacks ──
  if (/anytime.*mint|\bmint candy\b|mint.*flavor.*\d+g.*pack|mint.*sugar.?free|breath.*mint.*candy|wellfood.*anytime/i.test(lower) && !/toothpaste|mouthwash/i.test(lower)) {
    return { type: "Korean Food > Snacks & Chips", src: "rule-mint-snack-top" };
  }

  // ── Shower Head / Bathroom Fittings → Household ──
  if (/shower head|shower.*hose|bathroom.*fitting|faucet.*head|bidet.*(?!car)/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-shower-top" };
  }

  // ── Fresh Cucumbers / Fresh Vegetables → Fresh Produce ──
  if (/\bmini cucumbers?\b|\bfresh cucumbers?\b|\bfresh.*tomatoes?\b|\borganic cucumbers?\b|eco.?friendly.*cucumbers?|fresh.*leafy|\bfresh onions?\b/i.test(lower) && !/cream|serum|toner|skincare/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-fresh-veg-top" };
  }

  // ── Grilled Wraps (쌈 세트) → Fresh Produce ──
  if (/grilled.*wraps|wraps.*(?:minari|perilla|lettuce)|ssam.*(?:set|wraps)|korean bbq.*wraps/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-wraps-top" };
  }

  // ────────────────────────────────────────────────────────────────

  // ════════════════════════════════════════════════════════════════
  // 🚨 절대 최우선 — FOOD 강제 분류 블록
  // Beauty보다 먼저 실행 / 모든 brand/cushion 블록보다 먼저
  // ════════════════════════════════════════════════════════════════
  // 음식 강신호: 이 키워드가 있으면 Beauty 계열로 절대 못 감
  const _FOOD_HARD = /\bsoup\b|\bstew\b(?!.*cut)|\bramen\b|\bnoodle\b|\bkimchi\b|\btteokbokki\b|\bbibimbap\b|\bbulgogi\b|\bgalbi\b(?!.*tteok)|\bdoenjang\b|\bgochujang\b|dumpling|\bfrozen.*(?:meal|rice|veg|dumpling|cutlet|seafood)|\bfried rice\b|hangover.*soup|yukgaejang|미역국|김치|된장|고추장|잡채|불고기|라면|만두|떡볶이/i;

  // 음식 약신호: 다른 컨텍스트와 함께 체크
  const _FOOD_SOFT = /\btea\b(?!.*tree|.*tree.*oil|.*green.*extract)|\bdrink\b(?!.*probiotic.*supplement)|\bjuice\b(?!.*eye.*care|.*lens)|\bsnack\b|beverage|\bcoffee\b(?!.*scrub|.*body.*scrub)|\bmilk\b(?!.*thistle|.*bath|.*mist|.*lotion|.*formula|.*protein|.*baobab|.*colostrum|.*hair|.*shampoo)|\bgrain\b(?!.*alcohol|.*extract.*skin)|soybean|seafood(?!.*collagen)|\bvegetable(?!.*extract.*skin)|\bfruit\b(?!.*acid|.*enzyme.*skin)|\bbean\b(?!.*eye.*bag|.*spill)/i;

  // Beauty 컨텍스트 (soft food 신호가 있어도 이게 있으면 beauty 허용)
  const _BEAUTY_CTX = /serum|toner|ampoule|cleanser|moisturizer|sunscreen|spf|mask pack|sheet mask|essence.*skin|\bpore\b|\bacne\b|\bhydrating\b|\bsoothing.*skin|\banti.aging|wrinkle|collagen.*skin|peptide.*skin|ceramide|hyaluronic/i;

  if (_FOOD_HARD.test(lower)) {
    // 강신호 → food 분류 시도, null이면 계속
    const forced = _forceFoodClassify(lower, title, tags);
    if (forced) return forced;
  }

  if (_FOOD_SOFT.test(lower) && !_BEAUTY_CTX.test(lower)) {
    // 약신호 + beauty 컨텍스트 없음 → food 분류 시도
    const forced = _forceFoodClassify(lower, title, tags);
    if (forced) return forced;
  }
  // ════════════════════════════════════════════════════════════════

  // 0-0. 명확한 충돌 케이스 먼저 해결

  // ══ 스킨케어 오염 차단 (가장 먼저 실행) ══════════════════════════════════════
  // ① 칫솔/치약/구강 → Oral Care (Skincare 진입 전 차단)
  if (/toothbrush|toothpaste|mouthwash|whitening gel|whitening.*gel|dental floss|oral.?b|구강|치약|칫솔/i.test(lower)) {
    return { type: "Beauty > Oral Care", src: "rule-block-oral" };
  }
  // ② body cream/lotion/wash / hand cream → Body Care
  if (/body cream|body lotion|body wash|body butter|hand cream|hand lotion|바디 크림|핸드크림/i.test(lower)) {
    return { type: "Beauty > Body Care", src: "rule-block-body" };
  }
  // ② Sun Care가 Makeup보다 먼저: tone-up + sunscreen/spf → Sun Care
  if (/tone.*up.*(?:sunscreen|spf|sun cream|uv)|(?:sunscreen|spf|sun cream).*tone.*up/i.test(lower)) {
    return { type: "Beauty > Sun Care", src: "rule-toneup-sun" };
  }
  // All-in-One (메이크업 아닌 것) → Skincare
  // ⚠️ 세탁/청소 제품은 제외 (Cleaning Supplies로 처리)
  if (/\ball.in.one\b/i.test(lower) 
      && !/bb cream|foundation|cc cream|makeup/i.test(lower)
      && !/laundry|detergent|fabric|softener|cleaning|cleaner|disinfect|세탁|세제/i.test(lower)) {
    return { type: "Beauty > Skincare", src: "rule-aio-skin" };
  }
  // ② Makeup → Beauty > Makeup (Skincare 진입 전 차단)
  if (/\bfoundation\b|cushion.*foundation|\bbb cream\b|\bcc cream\b|\bpact\b(?!.*vitamin|.*probio)|\bconcealer\b|\bprimer\b(?!.*skincare|.*serum)|\blipstick\b|\blip gloss\b|\blip tint\b|\blip balm\b|\beyeshadow\b|\beye shadow\b|\beyeliner\b|\bmascara\b|\bsetting powder\b|\bsetting spray\b|\bblush\b(?!.*skin|.*cream|.*drink)|\bblusher\b|\bhighlighter\b(?!.*skin|.*stationer|.*marker|.*eraser)|\bcontour\b|\bshading\b(?!.*effect)|makeup.*base|tone.*up.*cream(?!.*body|.*sunscreen)|\btinted.*base\b|cover pact|air cushion|파운데이션|립스틱|틴트(?!.*보조|.*용)|아이섀도|마스카라|컨실러|아이라이너/i.test(lower)) {
    return { type: "Beauty > Makeup", src: "rule-block-makeup" };
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
  if (/fava bean|red lentil|lupin bean|lentil(?!.*protein bar|.*supplement)|chickpea|garbanzo|white soybean|\bbaektae\b|black.eyed pea|black eyed pea|\bsorghum\b|kidney bean(?!.*paste|.*sauce)|\bred kidney bean\b(?!.*paste)/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-legumes" };
  }
  // oats / bracken fern / dried vegetable (식품용만)
  if (/\boat(?!.*milk|.*cookie|.*cereal|.*plate|.*bowl|.*mug|.*ceramic|.*dinnerware|.*tableware|.*dish)|rolled oat|bracken fern|dried bracken|tiger.*bean|herbal.*bean/i.test(lower)
      && !/plate|dinnerware|ceramic|tableware|mug|kitchen|\bdish\b(?!.*food|.*meal)|botanic garden|portmeirion/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-oats-bracken" };
  }
  // black soybeans → Fresh Produce (AI 오분류 방지)
  if (/black soybean|seoritae|서리태|검정콩|seomok|seomoktae/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-black-soy" };
  }
  // grain mix / five-grain / multi-grain → Packaged Foods
  if (/grain.*mix|\bfive.grain\b|multi.grain|잡곡|오곡|현미(?!.*snack)/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-grain-mix" };
  }
  // traditional noodle / wheat noodle → Ramen & Noodles
  if (/\bnoodle\b(?!.*bowl.*ceramic|.*dish)|wheat noodle|medium noodle|traditional.*noodle/i.test(lower)) {
    return { type: "Korean Food > Ramen & Noodles", src: "rule-noodle" };
  }
  // dried herb for health / bidens / wellness herb → Health & Supplements
  if (/bidens herb|dried.*herb.*(?:health|wellness|remedy)|herbal.*remedy|natural.*remedy(?!.*hair)/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-herb-health" };
  }
  // barbershop / neck shaper / hairline trimmer → Household Supplies
  if (/barbershop|neck shaper|neck.*sharper|hairline.*trim|hair.*trim.*tool/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-barbershop" };
  }
  // pokemon / anime sticker set → Stationery
  if (/pokemon.*(?:sticker|note|phrase|set)|anime.*sticker|sanrio.*sticker|character.*sticker.*set/i.test(lower)) {
    return { type: "Stationery & Office", src: "rule-char-sticker" };
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

  // ① all-in-one + 세제/세탁 → Cleaning Supplies (Skincare 오염 방지 최우선)
  if (/all.in.one/i.test(lower) && /detergent|laundry|capsule.*wash|fabric|세제|세탁/i.test(lower)) {
    return { type: "Home & Living > Cleaning Supplies", src: "rule-aio-detergent" };
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
  // mold remover / detergent / cleaning → Cleaning Supplies
  if (/mold remover|nano.*coat|nano.*clean|stain.*remover(?!.*laundry.*brand)|clorox|bleach(?!.*tooth|.*white)|laundry detergent|fabric softener|dishwash.*liquid|dish soap(?!.*skin)|floor cleaner|drain cleaner/i.test(lower)) {
    return { type: "Home & Living > Cleaning Supplies", src: "rule-cleaning" };
  }
  // 성인용 위생용품 → Household
  if (/incontinence pad|adult.*pad(?!.*launch)|adult.*diaper|adult.*nappy/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-adult-care" };
  }
  // bath towel / quilt cover → Household
  if (/\bbath towel\b|\bquilt cover\b|\bquilt.*case\b|hotel.*towel|combed cotton.*towel|waterproof.*quilt|extra large.*quilt/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-towel" };
  }
  // ② Sun Care 조기 차단 (Skincare보다 먼저)
  if (/\bspf\b|sunscreen|sun cream|sun stick|sun milk|sun ampoule|sun.*stick.*spf|soothing.*sun.*stick|moisture.*sun/i.test(lower) && !/sun.*flower|sun.*dried|sun.*burn(?!.*protect)|sunrise|sunday/i.test(lower)) {
    return { type: "Beauty > Sun Care", src: "rule-sun-early" };
  }

  // ── Frozen Food → Korean Food > Frozen Food ─────────────────────────────────
  if (/\bfrozen\b(?!.*yogurt|.*berry(?!.*soup)|.*fresh)/i.test(lower) && /meal|rice|dumpling|cutlet|seafood|vegetable|veg\b|veggie|shrimp|pork|beef|chicken|wing|steak|spinach|garlic|squid|fish|bibimbap|stir.fried/i.test(lower)) {
    return { type: "Korean Food > Frozen Food", src: "rule-frozen-food" };
  }
  // ── Refrigerated Foods ───────────────────────────────────────────────────────
  if (/(?:pork|beef|chicken|duck|lamb|meat|galbi|rib|boneless).*(?:chilled|refrigerated)|(?:chilled|refrigerated).*(?:pork|beef|chicken|duck|lamb|meat|galbi|rib)/i.test(lower)) {
    return { type: "Korean Food > Refrigerated Foods", src: "rule-refrigerated" };
  }
  // 한우/beef grade 제품 → Packaged Foods or Refrigerated
  if (/hanwoo|\bkorean beef\b.*(?:grade|premium|gold)|\bbeef\b.*(?:grade|premium gold)|ajuzone.*beef/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-hanwoo" };
  }
  // 냉장 절단 육류 (stew cut, boneless, etc.)
  if (/(?:stew cut|boneless cut|leg cut|front leg|shoulder cut|\bcut piece).*(?:pork|beef|chicken|duck)|(?:pork|beef|chicken|duck).*(?:stew cut|boneless cut|leg cut|front leg)/i.test(lower)) {
    return { type: "Korean Food > Refrigerated Foods", src: "rule-meat-cut2" };
  }
  // 신선 과일 → Fresh Produce (AI 오분류 방지)
  if (/\b(?:fresh|premium|imported|domestic|australian|korean|shine muscat)\s+(?:black|green|red|white|purple)?\s*(?:grape|grapes|apple|apples|peach|peaches|mango|mangoes|strawberry|strawberries|blueberry|blueberries|cherry|cherries|orange|oranges|tangerine|tangerines|pear|pears)\b/i.test(lower)
      && !/juice|wine|jam|jelly|dried|candy|gummy|yogurt.*flavor|ice cream|cake|pie|soap|mask|cream|serum/i.test(lower)) {
    return { type: "Korean Food > Fresh Produce", src: "rule-fresh-fruit" };
  }

  // ═══ Toothbrush Holder → Household (칫솔걸이, 칫솔 아님) ═══
  if (/toothbrush.*(?:holder|stand|rack|organizer)|(?:holder|stand|rack|organizer).*toothbrush|dental.*organizer|bathroom.*toothbrush.*organizer/i.test(lower)) {
    return { type: "Home & Living > Household Supplies", src: "rule-tb-holder" };
  }

  // ═══ Car Cabin Filter → Automotive (Hair Care 오인 차단) ═══
  if (/cabin filter|air.conditioner.*filter.*car|car.*air.conditioner.*filter|car.*filter|vehicle.*filter|pm2\.5.*car|차량.*필터|캐빈.*필터/i.test(lower)) {
    return { type: "Automotive", src: "rule-cabin-filter" };
  }

  // ═══ Car Air Freshener / Perfume Sachet for Car → Automotive ═══
  if (/car.*(?:air.*freshener|diffuser|perfume.*sachet|interior.*freshener)|perfume.*sachet.*car|rooptang.*car|car.*(?:freshener|scent)/i.test(lower)) {
    return { type: "Automotive", src: "rule-car-freshener" };
  }

  // ═══ Hair Color / Hair Dye (콩/밤 brand 이름 오인 차단) ═══
  if (/hair.*(?:color|dye|coloring|tint)|color.*cream.*hair|gray.*hair.*dye|흰머리.*염색|염색약|new hello.*cream.*hair|hello bubble.*hair|mise.?en.?scene|liese|lien.*hair|cellribone.*hair/i.test(lower) && !/\bshampoo\b|\bconditioner\b/.test(lower)) {
    return { type: "Beauty > Hair Care", src: "rule-hair-dye-ext" };
  }

  // ═══ Eye Cream / Eye Patch / Eye Mask → Skincare ═══
  if (/eye cream|eye patch|eye.*mask(?!.*sleep|.*night.*eye)|under.eye.*(?:patch|cream|serum)|dark.circle.*(?:patch|mask|treatment|cream)|dr\.?headison.*eye|eye.*lifting|eye.*(?:cream|serum|gel)|lifting.*eye.*cream|auto.*eye.*cream/i.test(lower)) {
    return { type: "Beauty > Skincare", src: "rule-eye-skin" };
  }

  // ═══ Teeth Whitening Kit (Hair Care/기타 오인 차단) → Oral Care ═══
  if (/teeth whitening|dental bleaching|professional.*whitening|whitening kit|briol.*homme.*teeth/i.test(lower)) {
    return { type: "Beauty > Oral Care", src: "rule-whitening-kit" };
  }

  // ═══ 세제 캡슐 (Cleaning Supplies 명확히) — Household 차단 ═══
  if (/detergent capsule|capsule detergent|laundry capsule|laundry pod|washing pod|세탁캡슐|캡슐세제|스킨 케어.*캡슐(?!.*skincare)/i.test(lower)) {
    return { type: "Home & Living > Cleaning Supplies", src: "rule-detergent-cap" };
  }

  // ═══ Massage Ball / Sports Support Band → Sports ═══
  if (/massage.*(?:ball|roller|gun|stick)|foam.*roller|trigger.*point|(?:arch|core|wrist|ankle|knee|elbow|back|ribbon).*support.*band|sports.*band|sports.*arch|release.*massage|\byoga mat\b|\bresistance band\b|pilates|재활.*밴드|근육.*완화/i.test(lower)) {
    return { type: "Sports & Outdoors > Exercise & Fitness", src: "rule-sport-mass" };
  }

  // ═══ Swim Cap/Goggles → Sports Swimming ═══
  if (/swim.*cap|swim.*goggles|swimming.*goggles|anti.fog.*goggles.*swim|waterproof.*swim|swimming.*gear|수영모|수경(?!.*field)/i.test(lower)) {
    return { type: "Sports & Outdoors > Swimming", src: "rule-swim-gear" };
  }

  // ═══ Vacuum Cleaner → Cleaning (Stationery/Beauty 오인 차단) ═══
  if (/vacuum cleaner|vacuum.*(?:mini|handheld|cordless|robot)|진공청소기|vacuum sweeper|eraser.*vacuum/i.test(lower)) {
    return { type: "Home & Living > Cleaning Supplies", src: "rule-vacuum" };
  }

  // ═══ 씨김(seasoned laver sheets) → Banchan (Sauces 오인 차단) ═══
  if (/seasoned.*laver|laver.*seasoned|(?:perilla|sesame).*oil.*laver.*sheets|laver.*sheets.*(?:perilla|sesame|roasted)|roasted.*seaweed.*sheet|김 반찬|재래김|조미김/i.test(lower)) {
    return { type: "Korean Food > Banchan", src: "rule-seasoned-laver" };
  }

  // ═══ Mixed Nuts → Snacks (Household/Other 오인 차단) ═══
  if (/mixed nuts|nuts mix|nut mix|assorted nuts|\btrail mix\b|premium.*nut.*(?:pack|bag|can)|건강.*견과|견과류 믹스|kongnamul|nutheim/i.test(lower)) {
    return { type: "Korean Food > Snacks & Chips", src: "rule-mixed-nuts" };
  }

  // ═══ Green Tea Waffles / Tofu Noodle Snack → Snacks ═══
  if (/green tea.*waffle|tea.*waffle|green tea.*(?:cookie|cracker|biscuit|snack|chocolate)|matcha.*(?:cookie|cracker|waffle|snack)|tofu.*noodle.*snack|noodle.*snack(?!.*ramen)|healthy.*snack.*protein.*vegan/i.test(lower)) {
    return { type: "Korean Food > Snacks & Chips", src: "rule-tea-snack" };
  }

  // ═══ Porridge / Japchae Fried Rice → Packaged Foods (Snacks/Ramen 오인 차단) ═══
  if (/porridge|\bjook\b|\bhetbahn\b.*(?:porridge|rice)(?!.*ramen)|abalone porridge|beef porridge|chicken porridge|scorched rice.*porridge|japchae.*fried rice|japchae.*(?:pack|stir.fried)|glass noodle.*(?:dish|fried|stir)|\bbap club\b/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-porridge-meal" };
  }

  // ═══ Frozen Fried Rice → Frozen Food (Refrigerated 오인 차단) ═══
  if (/(?:frozen|냉동).*fried rice|fried rice.*(?:frozen|냉동)|(?:frozen|냉동).*(?:chicken breast|japchae|kimchi|bulgogi|shrimp).*(?:rice|pack)|chicken.*breast.*fried rice.*(?:kimchi|vegetable|frozen|pack)|gourmet.*chicken.*breast.*fried rice/i.test(lower)) {
    return { type: "Korean Food > Frozen Food", src: "rule-frozen-fr" };
  }

  // ═══ Dried/Roasted/Powder 콩류 → Packaged Foods (Fresh Produce 차단) ═══
  if (/(?:dried|roasted|volumed|볶은|말린|hot air roasted).*(?:bean|chickpea|garbanzo|lentil|soybean|seoritae|서리태|black bean|kidney bean|cranberry bean|lupin bean|fernbrake|bracken|chwinamul|gondre|namul)|(?:bean|chickpea|garbanzo|lentil|soybean|fernbrake|bracken).*(?:dried|roasted|powder|가루)|(?:mixed bean|bean.*bundle|multi.*bean|bean powder|곡물 가루|bean.*flour|pavabin|pa.?ba bean|mixed beans|beans bundle)|\b(?:bean|grain).*powder(?!.*baby|.*foundation|.*compact|.*setting|.*makeup)|dried.*fernbrake|fernbrake.*bracken|healthy.*(?:mixed beans|beans bundle)|(?:kidney|cranberry|round|black).*beans.*(?:bundle|mixed|whole.*pack|pack of \d+)/i.test(lower)) {
    return { type: "Korean Food > Packaged Foods", src: "rule-dried-bean" };
  }

  // ═══ Pet Supplies 우선 감지 (Baby Toys보다 먼저) ═══
  // cat toy, dog toy, pet food 등은 Baby Toys/Household/Health로 가면 안 됨
  if (/\bcats?\b.*(?:toy|feather|fishing rod|wand|ball|tunnel|scratcher|litter)|(?:toy|feather|fishing rod|wand|ball).*\bcats?\b|\bdogs?\b.*(?:toy|chew|treat|food|leash|collar|harness)|(?:toy|chew|treat|food).*\bdogs?\b|\brabbits?\b.*(?:food|treat|hay|supplement|side dish)|royal canin|orijen|acana|blue buffalo|\bhill.*science\b|\bwellness core\b|\bnaturepet\b|\bdingdongpet\b|\bpetsmon\b|\bttpet\b|\blowyd.*cat\b|\btigerpavilion\b|pet.*(?:food|treat|toy|supplement|meal|snack)|강아지.*(?:사료|간식|용품)|고양이.*(?:사료|간식|용품|장난감)|pet\s*supplies|electric.*toy.*ball.*cat|toy ball.*cat|for cats|for dogs|고양이.*낚시/i.test(lower)) {
    return { type: "Pet Supplies", src: "rule-pet-early" };
  }

  // ═══ Protein 제품 → Health & Supplements (Snacks/Beverages보다 먼저) ═══
  // 프로틴 파우더/쉐이크/드링크는 음식 키워드가 있어도 무조건 Health
  if (/\b(?:whey|wpi|wpc|isp|isolate|casein|bcaa|eaa)\b|protein (?:powder|shake|drink|isolate|concentrate|beverage|bar)|(?:chocolate|vanilla|strawberry|cookie).*(?:whey|protein shake|protein powder|protein drink)|(?:whey|protein).*(?:isolate|powder|shake)|\bleucine\b|mass gainer|weight gainer|meal replacement shake|muscle.*support.*supplement|colostrum.*protein|goat milk.*protein|collagen.*protein|\bdeprotein\b|\bprotein.rich\b|nutritional.*beverage|protein.*supplement|protein-rich/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-protein-supp" };
  }

  // ═══ Milk Thistle / Silymarin → Health (Packaged로 가는 오류 차단) ═══
  if (/milk thistle|silymarin|\bliver.*support\b|간\s*건강/i.test(lower)) {
    return { type: "Korean Food > Health & Supplements", src: "rule-milk-thistle" };
  }

  // ═══ 육수 정제(Broth) tablets - Yuksoo 같은 알약형 육수 → Sauces ═══
  if (/yuksoo.*tablet|\byuksoo\b|broth.*tablet|육수.*정제|mamakoin|tomato village.*mamakoin|stock.*tablet(?!.*vitamin|.*supplement|.*collagen)|\byuk soo\b/i.test(lower)) {
    return { type: "Korean Food > Sauces & Condiments", src: "rule-broth-tablet" };
  }

  // 세라믹/도자기 식기류 → Kitchenware (식품 키워드 오인 방지)
  // noodle bowl, soup bowl, shaved ice bowl, stainless bowl, insulated bowl 등 포함
  if (/portmeirion|botanic garden.*(?:plate|bowl|dish)|ceramic.*(?:plate|bowl|dish|dinnerware|mug|cup|serving)|dinnerware.*set|tableware.*set|\bchina\b.*(?:plate|dish|bowl|set)|porcelain.*(?:plate|bowl|cup)|melamine.*(?:plate|bowl|dish)|bone china.*(?:bowl|plate)|insulated.*(?:bowl|mug)|stainless.*steel.*(?:bowl|noodle bowl|cold noodle bowl|\d+\s*cm)|stainless.*\d+.*(?:bowl|noodle)|\bsus\s*304\b|vacuum.*insulated.*bowl|cold noodle bowl|(?:noodle|soup|serving|dining|rice).*bowl.*(?:set|ceramic|porcelain|stainless|melamine|character|bpa|4pcs|set of)|pasta bowl|dining.*bowl|character.*handle.*bowl|character.*bowl.*set|shaved ice.*bowl|nonstick.*(?:pan|pot|cookware)|cookware.*set|frying.*pan/i.test(lower)) {
    return { type: "Home & Living > Kitchenware", src: "rule-ceramic-dishware" };
  }

  // 영양 보충제 - albumin/EAA/garcinia/catechin → Health (AI 오분류 방지)
  if (/\balbumin\b(?!.*skin|.*face)|\beaa\b(?!.*skin)|essential amino acid|drinkable.*(?:albumin|protein)|amino acid.*(?:supplement|powder|boost)|garcinia(?!.*cream|.*serum)|\bcatechin\b(?!.*face.*cream|.*skin)|\bhca\b|weight management(?!.*soap|.*body wash)|diet.*supplement|\d+\s*tablets?\b(?!.*skincare)|\d+\s*capsules?\b(?!.*skincare)|scorched rice|nurungji|누룽지|secret coin|동전육수/i.test(lower)) {
    if (/scorched rice|nurungji|누룽지/i.test(lower)) return { type: "Korean Food > Snacks & Chips", src: "rule-nurungji" };
    if (/secret coin|동전육수|coin.*stock|coin.*broth/i.test(lower)) return { type: "Korean Food > Sauces & Condiments", src: "rule-secret-coin" };
    return { type: "Korean Food > Health & Supplements", src: "rule-health-ext" };
  }
  // 달걀/알류 → Refrigerated Foods
  if (/quail.*egg|\bchewy.*egg\b|\begg\b.*(?:pack of \d+|\d+ piece|refrigerated|fresh)|quail/i.test(lower) && !/supplement|protein|vitamin|eye/i.test(lower)) {
    return { type: "Korean Food > Refrigerated Foods", src: "rule-eggs" };
  }
  if (/marinated.*(?:pork|beef|chicken|duck|bulgogi|galbi)/i.test(lower) && !/sauce|paste/i.test(lower)) {
    return { type: "Korean Food > Refrigerated Foods", src: "rule-marinated-meat" };
  }
  // ── Beverages ────────────────────────────────────────────────────────────────
  if (/\bjuice\b(?!.*eye|.*lens)|cold brew coffee|probiotic.*drink(?!.*capsule|.*tablet)|aloe.*drink|\bilohas\b|capri.*sun|flavored.*water(?!.*lotion)|\benergy drink\b|sports.*drink(?!.*supplement)|fruit.*tea.*collection|honey.*tea(?!.*mask)|herbal.*tea.*collection|assorted.*tea(?!.*supplement)/i.test(lower)) {
    return { type: "Korean Food > Beverages", src: "rule-beverages" };
  }
  if (/\bmilk\b.*(?:pack of \d+|\d+ml.*pack|mini.*\d+|bottles?.*\d+|\d+.*bottles?)/i.test(lower) && !/thistle|bath|formula|lotion|shampoo/i.test(lower)) {
    return { type: "Korean Food > Beverages", src: "rule-milk-beverage" };
  }
  // ── Soup 우선순위: Fresh Produce보다 먼저 잡아야 함 ─────────────────────────
  // instant soup / cream soup / cup soup / hangover soup → Packaged Foods
  if (/instant.*soup|cream.*soup|cup.*soup|hangover.*soup|freeze.dried.*soup|\bsoup\b.*mix|soup.*mix|\bmiso soup\b|egg.*soup|pollack.*soup|yukgaejang|radish.*soup|soup.*radish|beef.*soup(?!.*base)|seaweed.*soup(?!.*powder)|variety.*soup|soup.*variety.*pack|ready.to.serve.*soup|marukome|ryotei.*aji|canned.*fruit|\bchicken soup\b|cheese.*soup|corn.*soup|bean.*powder(?!.*supplement)/i.test(lower)) {
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
  // MSG / seasoning / sauces → Sauces & Condiments
  if (/\bmsg\b|monosodium glutamate|l.glutamate.*sodium|ajinomoto|\bmiwon\b|nucleotide.*season|\bfurikake\b|katsuobushi.*season|seasoning powder|cooking.*seasoning|cooking.*essence|\bdoenjang\b|soybean paste|\ballulose\b|sugar substitute(?!.*supplement)|fruit.*concentrate(?!.*vitamin)|powdered sugar|fermented.*seasoning|chicken.*powder(?!.*supplement)|sesame.*seed(?!.*supplement)|roasted.*sesame/i.test(lower)) {
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
  // baseball hat / sun cap / bucket hat → Fashion > Hats
  if (/\bbaseball hat\b|\bbaseball cap\b|\bsun cap\b|\bbucket hat\b|\bmesh cap\b|brim.*cap|brim.*hat|trucker.*cap|running.*cap/i.test(lower) && !/baby|kids|infant/i.test(lower)) {
    return { type: "Fashion > Hats", src: "rule-hat" };
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
  // insole / knee brace / support brace → Sports > Exercise & Fitness
  if (/\binsole\b|carbon.*insole|fiber.*insole|knee.*support|knee.*brace|support.*brace|ankle.*brace|wrist.*support|elbow.*support/i.test(lower)) {
    return { type: "Sports & Outdoors > Exercise & Fitness", src: "rule-sport-support" };
  }
  // foam bat / cloth book / sensory toy / bubble gun (kids) → Baby > Toys & Games
  if (/foam.*bat(?!.*cricket)|soft.*bat.*kids|cloth.*book(?!.*adult)|sensory.*book|fabric.*book.*baby|step stool.*toddler|toddler.*step stool|bubble gun|\bwater gun\b|bubble.*solution.*(?:kids|outdoor|play)|outdoor.*play.*set.*kids|kids.*outdoor.*toy/i.test(lower)) {
    return { type: "Baby & Kids > Toys & Games", src: "rule-baby-toy-ext" };
  }
  // inflatable / earplugs for swimming → Sports > Swimming
  if (/inflatable.*tube|ride.on.*inflatable|\bswim.*float\b|\bbaby.*float\b|inflatable.*arm|\barm tube\b|\bswim ring\b|swim.*ring|earplug.*nose|nose clip.*swim|silicone.*earplug.*shower|swim.*earplug/i.test(lower)) {
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
  if (/waterproof/i.test(lower) && !/mascara|sun|foundation|sunscreen/i.test(lower)) {
    const wRescue = rescueClassify(title, tags);
    if (wRescue) return wRescue;
  }
  // dish/kitchen gloves → Kitchenware / cleaning/laundry gloves → Household
  if (/\bgloves?\b/i.test(lower)) {
    if (/dish|kitchen|주방/i.test(lower)) return { type: "Home & Living > Kitchenware", src: "rule-gloves" };
    if (/cleaning|laundry|세탁|청소/i.test(lower)) return { type: "Home & Living > Household Supplies", src: "rule-gloves" };
  }

  // 0-1. 뷰티 브랜드 — 카테고리 세분화 우선
  if (/huxley|dr\.bio|some by mi|somebymi|\bklairs\b|axis.?y|dr\.jart|jungsaemmul|papa recipe|torriden|tori.?dden|round lab|roundlab|skin1004|\banua\b|\bcosrx\b|mediheal|\bdalba\b|innisfree|laneige|sulwhasoo|etude/i.test(text)) {
    // Hair Care
    if (/shampoo|conditioner|hair mask|hair oil|hair essence|hair serum|scalp|샴푸|컨디셔너|헤어/i.test(text))
      return { type: "Beauty > Hair Care", src: "rule-brand-hair" };
    // Body Care
    if (/body cream|body lotion|body wash|hand cream|hand lotion|body butter|바디|핸드크림/i.test(text))
      return { type: "Beauty > Body Care", src: "rule-brand-body" };
    // Makeup
    if (/foundation|bb cream|cc cream|concealer|primer|lip tint|lipstick|mascara|eyeliner|pact|blush|makeup/i.test(text))
      return { type: "Beauty > Makeup", src: "rule-brand-makeup" };
    // Sun Care
    if (/\bspf\b|sunscreen|sun cream|sun stick|sun milk|sun cushion|sun ampoule/i.test(text))
      return { type: "Beauty > Sun Care", src: "rule-brand-sun" };
    // Mask Packs
    if (/mask pack|sheet mask|\bmask\b(?!.*mascara)|마스크팩/i.test(text))
      return { type: "Beauty > Mask Packs", src: "rule-brand-mask" };
    // Oral Care
    if (/toothbrush|toothpaste|mouthwash|dental|구강/i.test(text))
      return { type: "Beauty > Oral Care", src: "rule-brand-oral" };
    // 기본 → Skincare
    return { type: "Beauty > Skincare", src: "rule-brand" };
  }

  // 0. Baby 관련 - 먼저 Baby Toys 체크 (크레용/장난감)
  if (/baby.*crayon|infant.*crayon|toddler.*crayon|baby.*art.*supplies|baby.*(?:drawing|coloring|painting|doodling)|kids.*crayon(?!.*makeup)|safe.*crayon.*kids|non.?toxic.*baby.*(?:crayon|art|paint)/i.test(lower)) {
    return { type: "Baby & Kids > Toys & Games", src: "rule-baby-art" };
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

  // 5. RULES 순회 전 — 음식/생활용품이 Beauty로 빠지는 것 최종 차단
  // (BLOCK_RULES의 isBlocked와 별개로 명시적 early-exit)
  const _foodKeyword = /\bsoup\b|\bstew\b(?!.*cut)|\btea\b(?!.*tree|.*tree.*oil)|\bdrink\b(?!.*probiotic.*supplement)|\bjuice\b(?!.*eye|.*lens)|\bsnack\b|\bbeverage\b|\bcoffee\b(?!.*scrub)|\bmilk\b(?!.*thistle|.*bath|.*lotion|.*formula|.*protein)|\bsoybean\b|\bseafood\b(?!.*collagen)|grain(?!.*alcohol)|bean(?!.*eye.*bag)|ramen|noodle|kimchi|bibimbap|bulgogi|dumpling|frozen.*meal|fried rice|hangover.*soup|yukgaejang/i.test(lower);
  const _nonBeauty = /toothbrush|toothpaste|\bdetergent\b|\blaundry\b|\binsole\b|knee.*brace|knee.*support|wrapping paper|folding fan|feather fan|\bnecklace\b|\bkeyring\b|tassel charm/i.test(lower);
  if (_foodKeyword || _nonBeauty) {
    // 이 항목들은 Beauty RULES로 절대 들어가지 않음
    // 아래 계속해서 food/household RULES로 분류됨
  }

  // 5. RULES 순회 + BLOCK_RULES 적용
  for (const rule of RULES) {
    // 음식/비뷰티 신호 → Beauty 카테고리 스킵
    if ((_foodKeyword || _FOOD_HARD.test(lower) || _FOOD_SOFT.test(lower)) && rule.type.startsWith("Beauty")) continue;
    if (_nonBeauty && rule.type.startsWith("Beauty")) continue;
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
    rx:/cleansing.*foam|cleansing.*oil|\bpad\b(?!.*launch|.*launch)|\bpatch\b(?!.*cable|.*repair)|mask pack|팩(?!.*떡|.*약|.*접착)|피부결|스킨케어|수분크림|아이크림|클렌징|필링|앰플|토너(?!.*매니큐어)/i },
  { type:"Korean Food > Health & Supplements",
    rx:/capsule|tablet|softgel|supplement|probiotic|enzyme|\biron\b|\bzinc\b|\bomega\b|\bmsm\b|propolis|\bvitamin\b|콜라겐|영양제|캡슐|정\b/i },
  // Snacks fallback — 스낵바/에너지바/쌀과자/누룽지칩 포함
  { type:"Korean Food > Snacks & Chips",
    rx:/\bcracker\b|\bbiscuit\b|\bcookie\b|\bsnack\b|\bgum\b|chewing gum|캔디|과자|비스킷|스낵바|에너지바|쌀과자|누룽지칩/i },
  { type:"Home & Living > Household Supplies",
    rx:/\bscrubber\b|수세미|sponge cleaner/i },
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

CRITICAL RULES (NEVER violate):
- Food products (soybeans, grains, noodles, soup, herbs for eating) → NEVER Beauty
- Stationery/toys (stickers, notes, character sets) → NEVER Beauty
- Kids toys (bubble gun, water gun, outdoor play set, toy set for kids) → Baby & Kids > Toys & Games, NEVER Beauty
- "solution" in kids/toy context (bubble solution, play solution) → NOT skincare → Baby & Kids > Toys & Games
- Household tools (neck shaper, hairline trimmer, barbershop tools) → NEVER Beauty
- Black soybeans / seoritae / five-grain mix / multigrain → Korean Food > Fresh Produce or Packaged Foods
- Traditional wheat noodles / medium noodles → Korean Food > Ramen & Noodles
- Dried herbs for health/wellness (bidens, burdock, etc.) → Korean Food > Health & Supplements
- Pokemon / anime / character sticker set / note set → Stationery & Office
- Barbershop / neck shaper / hairline tool → Home & Living > Household Supplies

Key distinction - Korean Food > Snacks & Chips vs Korean Food > Packaged Foods:
- Snacks & Chips: ready-to-eat items (chips, crackers, cookies, candy, gummies, popcorn, rice snacks, nurungji chips, energy bars)
- Packaged Foods: meal or cooking-based items (ramen, dumplings, frozen food, instant rice, meal kits, porridge, curry, soup base)

New categories (use these):
- Beauty > Makeup: foundation, cushion, BB cream, concealer, lipstick, mascara, pact
- Beauty > Oral Care: toothbrush, toothpaste, mouthwash, teeth whitening
- Korean Food > Frozen Food: frozen meals, frozen vegetables, frozen seafood
- Korean Food > Refrigerated Foods: chilled/fresh meat cuts, refrigerated food
- Korean Food > Beverages: juice, coffee drinks, milk packs, probiotic drinks
- Fashion > Hats: baseball cap, sun cap, bucket hat
- Fashion > Bags: backpack, tote bag, handbag
- Home & Living > Cleaning Supplies: detergent, fabric softener, bleach, mold remover

Rules:
- Nurungji chips / nurungji snack → Snacks (NOT Packaged)
- Plain nurungji → Snacks (default safer)
- Dried seaweed / kim / miyeok → Banchan or Packaged Foods
- Herbal tea / fruit tea / honey tea → Korean Food > Beverages
- Barley tea / corn tea → Korean Food > Beverages
- Flour / powder / starch → NOT Packaged (ingredient, leave as Other)
- Pancake mix → NOT Packaged
- Foundation / cushion / bb cream → Beauty > Makeup (NOT Skincare)
- Sun stick / sunscreen / SPF product → Beauty > Sun Care (NOT Skincare)

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
  // ── StoreBot 자체 계산 컬럼 제거 (중복 방지) ──────────────────────────
  // StoreBot CSV는 Est. Weight/Shipping/Original Price/Suggested Price를 이미 포함
  // → classifier가 extraH로 새로 계산해서 덮어쓰면 중복 컬럼 발생
  // → SKIP_COLS에 넣어 원본 4개 제거, 새로 추가되는 4개만 유지
  const SKIP_COLS = new Set(["Est. Weight (kg)","Shipping ($)","Original Price","Suggested Price"]);
  const keepIdx = headers.map((h,i)=>SKIP_COLS.has(h)?-1:i).filter(i=>i>=0);
  const filteredHeaders = keepIdx.map(i=>headers[i]);
  
  // 재고 컬럼 인덱스 (원본 headers 기준)
  const invTrackerIdx  = headers.indexOf("Variant Inventory Tracker");
  const invPolicyIdx   = headers.indexOf("Variant Inventory Policy");
  const invFulfillIdx  = headers.indexOf("Variant Fulfillment Service");
  const invQtyIdx      = headers.indexOf("Variant Inventory Qty");
  
  // 재고 컬럼이 없으면 extraH로 추가 (Shopify 필수)
  const needInvCols = invTrackerIdx < 0 && invPolicyIdx < 0 && invFulfillIdx < 0;

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
  // extraH: 계산된 가격/무게 + (필요 시) 재고 컬럼
  const extraH = ["Est. Weight (kg)","Shipping ($)","Original Price","Suggested Price"];
  if (needInvCols) {
    extraH.push("Variant Inventory Tracker","Variant Inventory Policy","Variant Fulfillment Service","Variant Inventory Qty");
  }

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
    // Product Category에도 동일한 분류값 기록 (Shopify 필터링용)
    // ⚠️ isFirst 여부 관계없이 모든 행에 적용 (Shopify 컬렉션 필터링)
    const pcIdx = headers.indexOf("Product Category");
    if(pcIdx>=0 && r.newType) {
      nr[pcIdx] = r.newType;
    }

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
      
      // ⚠️ 이중 배송비 방지: StoreBot의 "Original Price" 컬럼이 있으면 그 값을 원가로 사용
      //    없으면 Variant Price에서 기존 배송비(StoreBot 계산값)를 역산하여 제거
      const origPriceIdx = headers.indexOf("Original Price");
      const storebotShipIdx = headers.indexOf("Shipping ($)");
      const vpRaw = parseFloat(row[idx.pi]||"0")||0;
      
      if (origPriceIdx >= 0 && row[origPriceIdx]) {
        // StoreBot에 원가 컬럼이 있음 → 그걸 true 원가로 사용
        varOrigPrice = parseFloat(String(row[origPriceIdx]).replace(/[$,]/g,""))||0;
      } else if (storebotShipIdx >= 0 && row[storebotShipIdx]) {
        // StoreBot이 이미 배송비 더한 경우 → 역산
        const storebotShip = parseFloat(String(row[storebotShipIdx]).replace(/[$,]/g,""))||0;
        varOrigPrice = Math.max(0, vpRaw - storebotShip);
      } else {
        // 원가 정보 없음 → Variant Price 그대로 사용
        varOrigPrice = vpRaw;
      }
      
      varSuggested = varOrigPrice>0 ? (varOrigPrice+varShipping).toFixed(2) : null;

      // Variant Grams
      if(idx.gi>=0) nr[idx.gi] = Math.round(varWeightKg*1000);
      // 가격 적용: 원가 + 배송비 (단일 마진)
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

    // extraH용 재고 컬럼 기본값
    const invVals = needInvCols ? ["shopify","deny","manual", isVariant ? "100" : ""] : [];
    
    return [
      ...filteredRow,
      isVariant ? varWeightKg.toFixed(2) : "",
      isVariant ? `$${varShipping.toFixed(2)}` : "",
      isVariant && varOrigPrice>0 ? `$${varOrigPrice.toFixed(2)}` : "",
      isVariant && varSuggested ? `$${varSuggested}` : "",
      ...invVals,
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

const CAT_COLORS={"Korean Food > Snacks & Chips":"#FF6B35","Korean Food > Packaged Foods":"#E67E22","Korean Food > Fresh Produce":"#27AE60","Korean Food > Sauces & Condiments":"#F39C12","Korean Food > Kimchi":"#E74C3C","Korean Food > Ramen & Noodles":"#C0392B","Korean Food > Banchan":"#D35400","Korean Food > Health & Supplements":"#16A085","Korean Food > Beverages":"#3498DB","Korean Food > Bread & Bakery":"#8B4513","Beauty > Skincare":"#E91E8C","Beauty > Hair Care":"#9B59B6","Beauty > Body Care":"#8E44AD","Beauty > Mask Packs":"#FF69B4","Beauty > Sun Care":"#F1C40F","Beauty > Fragrance":"#D98880","Home & Living > Kitchenware":"#2980B9","Home & Living > Household Supplies":"#1ABC9C","Stationery & Office":"#2C3E50","Pet Supplies":"#8D6E63","Other":"#FF8C00","Other":"#BDC3C7"};

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
  if (/foundation|bb cream|cc cream|concealer|lip tint|air cushion|cover pact/.test(t)) return "Beauty > Makeup";
  if (/facial mist|soothing mist|hydrating mist/.test(t) && !/\bsoup\b|\bfood\b|\bramen\b/i.test(t)) return "Beauty > Skincare";
  if (/spf|sunscreen|sun cream|uv protection/.test(t)) return "Beauty > Sun Care";
  if (/\bface lotion\b|facial moisturizer|skin care for men|men.*grooming/.test(t)) return "Beauty > Skincare";
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
