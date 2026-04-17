import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import { claude } from "../api";

// ── 35 Types ─────────────────────────────────────────────────────────────────
const TYPES = [
  "Beauty > Skincare","Beauty > Hair Care","Beauty > Body Care","Beauty > Mask Packs",
  "Beauty > Sun Care","Beauty > Perfume & Fragrance",
  "Korean Food > Kimchi","Korean Food > Fresh Produce","Korean Food > Snacks & Chips",
  "Korean Food > Bread & Bakery","Korean Food > Banchan","Korean Food > Sauces & Condiments",
  "Korean Food > Health & Supplements","Korean Food > Packaged Foods",
  "Fashion > Women's Clothing","Fashion > Men's Clothing","Fashion > Kids Clothing",
  "Fashion > Swimwear & Beachwear","Fashion > Shoes & Sandals","Fashion > Accessories",
  "Sports & Outdoors > Exercise & Fitness","Sports & Outdoors > Golf",
  "Sports & Outdoors > Swimming","Sports & Outdoors > Outdoor & Camping",
  "Home & Living > Household Supplies","Home & Living > Kitchenware","Home & Living > Home & Interior",
  "Baby & Kids > Baby Care","Baby & Kids > Toys & Games",
  "Stationery & Office","Automotive","Flowers & Gifts","Pet Supplies","$1 Bakery","Other",
];

// ── Rule-based classifier (우선순위 가이드 기준) ──────────────────────────────
// 순서 중요: 겹치는 키워드는 위에 있는 룰이 먼저 적용됨
const RULES = [
  // ① Kimchi — 가장 명확
  { type:"Korean Food > Kimchi",
    rx:/kimchi|kimchee|김치|깍두기|kkakdugi|총각김치|열무김치|동치미|백김치/i },
  // ② Banchan
  { type:"Korean Food > Banchan",
    rx:/banchan|namul|muchim|jorim|반찬|나물\b|무침|조림|장아찌|멸치볶음|깻잎(?!.*기름)/i },
  // ③ Sauces & Condiments
  { type:"Korean Food > Sauces & Condiments",
    rx:/gochujang|doenjang|soy sauce|ssamjang|고추장|된장|간장|쌈장|참기름|들기름|식초|소금\b|굴소스|다시다|국간장/i },
  // ④ Health & Supplements
  { type:"Korean Food > Health & Supplements",
    rx:/vitamin|probiotics|protein powder|collagen|red ginseng|비타민|유산균|오메가3?|콜라겐(?!.*크림|.*세럼)|홍삼|아르기닌|단백질 파우더|프로틴|영양제|보충제|루테인/i },
  // ⑤ Fresh Produce
  { type:"Korean Food > Fresh Produce",
    rx:/친환경|유기농|무농약|깻잎\b|치커리|상추\b|배추|오이\b|배\s|사과\b|딸기\b|포도\b|수박\b|참외\b|복숭아\b|귤\b|감\b|미나리|쑥갓|브로콜리|토마토|양파\b|마늘\b|애호박|당근\b|감자\b|고구마\b/i },
  // ⑥ Bread & Bakery (과자류보다 먼저 — cake/muffin 겹침 방지)
  { type:"Korean Food > Bread & Bakery",
    rx:/식빵|빵\b|크루아상|바게트|베이글|머핀|스콘|toast bread|sandwich bread/i },
  // ⑦ Snacks & Chips
  { type:"Korean Food > Snacks & Chips",
    rx:/chips|cracker|cookie|biscuit|candy|gummy|jelly candy|popcorn|콘칲|칩\b|과자|스낵|사탕|젤리(?!.*vitamin)|쿠키|비스킷|팝콘|강냉이|뻥튀기|나쵸|빼빼로|새우깡|꼬북칩|홈런볼|오징어집|꼬깔콘|프링글/i },
  // ⑧ Packaged Foods (넓은 기본 식품)
  { type:"Korean Food > Packaged Foods",
    rx:/ramen|noodle|instant|frozen|dumpling|tteokbokki|soup base|porridge|curry|라면|냉동|만두|떡볶이|죽\b|즉석밥|햇반|국수\b|냉면|비빔밥|순대|라이스누들|쌀국수|우동\b|당면|스프\b/i },
  // ⑨ Food brand catch-all (식품 브랜드명 있으면 Packaged Foods)
  { type:"Korean Food > Packaged Foods",
    rx:/오뚜기|농심|삼양|빙그레|크라운(?!.*화장)|청우식품|동원|청정원|풀무원|샘표|하림|남양유업|매일유업/i },
  // ── Beauty (순서 중요) ──
  // ⑩ Sun Care
  { type:"Beauty > Sun Care",
    rx:/sunscreen|sun cream|sunblock|\bspf\b|uv protection|선크림|선블록|자외선차단/i },
  // ⑪ Mask Packs
  { type:"Beauty > Mask Packs",
    rx:/sheet mask|sleeping mask|clay mask|nose pack|마스크팩|시트마스크|슬리핑마스크|클레이마스크|코팩/i },
  // ⑫ Hair Care (shampoo 먼저 — 카샴푸 제외)
  { type:"Beauty > Hair Care",
    rx:/hair shampoo|hair conditioner|hair mask|hair serum|scalp|샴푸(?!.*카|.*차량)|린스\b|헤어 트리트먼트|헤어마스크|두피|탈모샴푸/i },
  // ⑬ Body Care
  { type:"Beauty > Body Care",
    rx:/body wash|body lotion|hand cream|toothpaste|mouthwash|바디워시|바디로션|핸드크림|치약|구강청결제|가글/i },
  // ⑭ Perfume & Fragrance
  { type:"Beauty > Perfume & Fragrance",
    rx:/perfume|eau de parfum|fragrance|reed diffuser|향수|디퓨저|퍼퓸/i },
  // ⑮ Skincare (가장 넓음 — 마지막에)
  { type:"Beauty > Skincare",
    rx:/face cleanser|face toner|face serum|facial cream|face lotion|ampoule|facial essence|클렌저|폼클렌징|토너|앰플|세럼(?!.*헤어|.*hair)|에센스(?!.*헤어|.*hair)|수분크림|아이크림|비비크림|쿠션(?!.*방석)|파운데이션|미스트(?!.*헤어)/i },
  // ── Baby & Kids ──
  { type:"Baby & Kids > Baby Care",   rx:/diaper|baby lotion|baby shampoo|baby wipe|기저귀|아기로션|물티슈(?!.*일반)|젖병/i },
  { type:"Baby & Kids > Toys & Games",rx:/장난감|블록(?!.*수납)|퍼즐(?!.*성인)|보드게임|toy|building block/i },
  // ── Pet ──
  { type:"Pet Supplies",              rx:/dog food|cat food|dog treat|pet food|강아지사료|고양이사료|반려동물|펫푸드|강아지간식/i },
  // ── Stationery ──
  { type:"Stationery & Office",       rx:/ballpoint pen|pencil|eraser|scissors|tape\b|notebook(?!.*laptop)|marker|볼펜|연필|지우개|가위\b|테이프\b|노트(?!북 컴퓨터)|형광펜|포스트잇|크레용|크레파스/i },
  // ── Automotive ──
  { type:"Automotive",                rx:/car wax|car wash|tire|wiper|자동차|차량용|카워시/i },
  // ── Fashion ──
  { type:"Fashion > Swimwear & Beachwear", rx:/swimwear|bikini|rashguard|수영복|래쉬가드|비키니/i },
  { type:"Fashion > Shoes & Sandals",      rx:/sneakers|sandals|slippers|high heels|운동화|샌들|슬리퍼|구두/i },
  { type:"Fashion > Kids Clothing",        rx:/아동복|유아복|kids wear|children wear/i },
  { type:"Fashion > Women's Clothing",     rx:/women's clothing|여성복|원피스|블라우스|치마/i },
  { type:"Fashion > Men's Clothing",       rx:/men's clothing|남성복|셔츠(?!.*스킨)/i },
  { type:"Fashion > Accessories",          rx:/가방\b|지갑|모자\b|벨트\b|액세서리|bag(?!.*tea)/i },
  // ── Sports ──
  { type:"Sports & Outdoors > Golf",       rx:/golf|골프/i },
  { type:"Sports & Outdoors > Swimming",   rx:/수경|킥판|수영모|swim goggles|kickboard|swim cap/i },
  { type:"Sports & Outdoors > Outdoor & Camping", rx:/텐트|침낭|캠핑|랜턴(?!.*무드)|camping|sleeping bag/i },
  { type:"Sports & Outdoors > Exercise & Fitness", rx:/dumbbell|yoga mat|resistance band|pilates|덤벨|요가|필라테스|운동밴드|폼롤러/i },
  // ── Home ──
  { type:"Home & Living > Kitchenware",        rx:/frying pan|rice cooker|kitchen knife|냄비|프라이팬|도마|주방칼|밀폐용기|락앤락|주전자/i },
  { type:"Home & Living > Household Supplies", rx:/laundry detergent|dish soap|toilet paper|세제(?!.*헤어)|섬유유연제|주방세제|화장지|청소포|탈취/i },
  { type:"Home & Living > Home & Interior",    rx:/인테리어|가구|쿠션(?!.*방석 없을때)|수납|담요|홈데코/i },
  // ── Flowers ──
  { type:"Flowers & Gifts",  rx:/비누꽃|조화|프리저브드|soap flower|꽃다발|bouquet|선물세트/i },
  // ── $1 Bakery (자체 상품만) ──
  { type:"$1 Bakery",        rx:/\$1.*bakery|\$1.*korea|1달러.*베이커리/i },
];

const FOOD_W = /(\d+(?:\.\d+)?)\s*(g|ml)\s*[,，x×*]\s*(\d+)\s*(개|팩|봉|캔|병|박스|세트)?/i;

function ruleClassify(title) {
  if (FOOD_W.test(title)) {
    for (const r of RULES.slice(0,9)) { if (r.rx.test(title)) return { type:r.type, src:"rule" }; }
    return { type:"Korean Food > Packaged Foods", src:"rule-weight" };
  }
  for (const r of RULES) { if (r.rx.test(title)) return { type:r.type, src:"rule" }; }
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

const TRANS_PROMPT = `You are classifying GuamPick Shopify products.
Prefer conservative classification over aggressive guessing. When uncertain, choose the broader valid category.

Your job:
1. Choose exactly ONE category from the allowed list.
2. Translate the product title into natural English.
3. Write a short English product description in 2-3 sentences.
4. Detect brand tags only when reasonably confident.
5. Return JSON only.

Rules:
- You MUST choose from the allowed categories only. Do NOT invent new categories.
- Keep pack count, weight, volume in the English title.
- Frozen/tteokbokki/ramen/instant meals → "Korean Food > Packaged Foods"
- Fresh vegetables/fruits/raw produce → "Korean Food > Fresh Produce"
- Kimchi/kkakdugi → "Korean Food > Kimchi"
- Namul/muchim/jorim ready side dishes → "Korean Food > Banchan"
- Gochujang/doenjang/sesame oil/vinegar → "Korean Food > Sauces & Condiments"
- Vitamins/probiotics/red ginseng/protein → "Korean Food > Health & Supplements"
- Chips/candy/crackers/cookies/popcorn → "Korean Food > Snacks & Chips"
- face toner/serum/cleanser/ampoule → "Beauty > Skincare"
- shampoo/scalp/hair mask → "Beauty > Hair Care"
- body wash/lotion/toothpaste/hand cream → "Beauty > Body Care"
- sheet mask/sleeping mask/clay mask → "Beauty > Mask Packs"
- sunscreen/SPF/UV → "Beauty > Sun Care"
- If none clearly fit → "Other"

Allowed categories:
Beauty > Skincare | Beauty > Hair Care | Beauty > Body Care | Beauty > Mask Packs | Beauty > Sun Care | Beauty > Perfume & Fragrance
Korean Food > Kimchi | Korean Food > Fresh Produce | Korean Food > Snacks & Chips | Korean Food > Bread & Bakery | Korean Food > Banchan | Korean Food > Sauces & Condiments | Korean Food > Health & Supplements | Korean Food > Packaged Foods
Fashion > Women's Clothing | Fashion > Men's Clothing | Fashion > Kids Clothing | Fashion > Swimwear & Beachwear | Fashion > Shoes & Sandals | Fashion > Accessories
Sports & Outdoors > Exercise & Fitness | Sports & Outdoors > Golf | Sports & Outdoors > Swimming | Sports & Outdoors > Outdoor & Camping
Home & Living > Household Supplies | Home & Living > Kitchenware | Home & Living > Home & Interior
Baby & Kids > Baby Care | Baby & Kids > Toys & Games
Stationery & Office | Automotive | Flowers & Gifts | Pet Supplies | $1 Bakery | Other

Allowed brand tags (only when confident): Bibigo, Black and White Chef, Dr.G, Round Lab, COSRX, Innisfree, Laneige, Sulwhasoo, Etude, Some By Mi, Skin1004, Anua, Torriden

Confidence: 0.90-1.00 very clear | 0.75-0.89 likely | 0.60-0.74 ambiguous | below 0.60 → use broader category or Other

Return ONLY JSON (no markdown):
{"type":"...","title_en":"...","description":"...","confidence":0.00,"brandTags":[]}`;

const AI_TYPE_PROMPT = `Classify this product into exactly ONE of these types. Prefer conservative classification.
When uncertain choose the broader valid category or Other.
Reply with ONLY the type name:\n${TYPES.join("\n")}`;

function calcShipping(kg) { return Math.ceil(Math.max(kg, 0.1)) * 3; }

function downloadCSV(rawRows, headers, resultMap, applyPrice) {
  const seen = new Set();
  const ti=headers.indexOf("Title"), yi=headers.indexOf("Type");
  const bi=headers.indexOf("Body (HTML)"), tagi=headers.indexOf("Tags");
  const pi=headers.indexOf("Variant Price"), hi=headers.indexOf("Handle");
  const extraH = ["Est. Weight (kg)","Shipping ($)","Original Price","Suggested Price"];
  const rows = rawRows.map(row => {
    const r = resultMap[row[hi]]; if (!r) return [...row,"","","",""];
    const nr=[...row]; const isFirst=!seen.has(row[hi]); seen.add(row[hi]);
    if(ti>=0) nr[ti]=r.titleEn||r.title;
    if(yi>=0) nr[yi]=r.newType;
    if(isFirst){
      if(bi>=0&&r.description) nr[bi]=(row[bi]||"")+`<div style="margin-top:16px;padding-top:12px;border-top:1px solid #eee"><p>${r.description}</p></div>`;
      // Tags: merge brand tags + shipping-included tag
      const extraTags = [...(r.brandTags||[]), ...(applyPrice&&r.suggested ? ["shipping-included"] : [])];
      if(tagi>=0&&extraTags.length) nr[tagi]=mergeTags(row[tagi], extraTags);
      if(applyPrice&&pi>=0&&r.suggested) nr[pi]=r.suggested;
    }
    return [...nr, r.weightKg?.toFixed(2)||"", `$${r.shipping?.toFixed(2)||"0"}`, r.origPrice>0?`$${r.origPrice.toFixed(2)}`:"", r.suggested?`$${r.suggested}`:""];
  });
  const csv=[headers.concat(extraH),...rows].map(row=>row.map(c=>`"${String(c??"").replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"})),download:applyPrice?"guampick_final.csv":"guampick_ref.csv"});
  a.click();
}

const CAT_COLORS={"Korean Food > Snacks & Chips":"#FF6B35","Korean Food > Packaged Foods":"#E67E22","Korean Food > Fresh Produce":"#27AE60","Korean Food > Sauces & Condiments":"#F39C12","Korean Food > Kimchi":"#E74C3C","Korean Food > Banchan":"#D35400","Korean Food > Health & Supplements":"#16A085","Korean Food > Beverages":"#3498DB","Korean Food > Bread & Bakery":"#8B4513","Beauty > Skincare":"#E91E8C","Beauty > Hair Care":"#9B59B6","Beauty > Body Care":"#8E44AD","Beauty > Mask Packs":"#FF69B4","Beauty > Sun Care":"#F1C40F","Beauty > Perfume & Fragrance":"#D98880","Home & Living > Kitchenware":"#2980B9","Home & Living > Household Supplies":"#1ABC9C","Stationery & Office":"#2C3E50","Pet Supplies":"#8D6E63","$1 Bakery":"#FF8C00","Other":"#BDC3C7"};

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
        const seen=new Set(); const prods=[];
        rows.slice(1).forEach(r=>{const h=r[hi];if(h&&!seen.has(h)){seen.add(h);prods.push({handle:h,title:r[ti]||"",image:r[ii]||"",originalType:r[yi]||"",price:r[pi]||"0",tags:r[tagi]||""});}});
        setProducts(prods);
      },
    });
  },[]);

  const onDrop=(e)=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)parseFile(f);};

  const start=async()=>{
    if(!products.length||running) return;
    setRunning(true); setDone(false); rMapRef.current={}; rArrRef.current=[]; setResults([]); setRMap({});

    setStatus("⚡ 규칙 기반 분류 중...");
    const pre=products.map(p=>{
      const rc=ruleClassify(p.title);
      const wKg=Math.max(estimateWeight(p.title)??(DEF_W[rc?.type]||0.5),0.1);
      const brandTags=detectBrands(p.title+" "+p.tags);
      return {...p,ruleType:rc?.type||null,ruleSrc:rc?.src||"ai",weightKg:wKg,brandTags};
    });

    const BATCH=8;
    for(let i=0;i<pre.length;i+=BATCH){
      const chunk=pre.slice(i,i+BATCH);
      await Promise.allSettled(chunk.map(async p=>{
        let titleEn=p.title, description="", aiType=null;
        try{
          const raw=await claude(TRANS_PROMPT,`Title: ${p.title}\nBody HTML: (omitted)\nVendor: \nExisting Tags: ${p.tags}`,400);
          const m=raw.match(/\{[\s\S]*?\}/);
          if(m){
            const j=JSON.parse(m[0]);
            titleEn=j.title_en||p.title;
            description=j.description||"";
            // Use AI type if rule didn't catch it
            if(!p.ruleType&&j.type&&TYPES.includes(j.type)) aiType=j.type;
            // Merge AI brand tags
            if(j.brandTags?.length) p.brandTags=[...new Set([...p.brandTags,...j.brandTags])];
          }
        }catch(_){}
        if(!p.ruleType&&!aiType){
          try{const t=await claude(AI_TYPE_PROMPT,p.title,60);if(t&&TYPES.includes(t.trim()))aiType=t.trim();}catch(_){}
        }
        const finalType=p.ruleType||aiType||p.originalType||"Other";
        const shipping=calcShipping(p.weightKg);
        const origPrice=parseFloat(p.price)||0;
        const suggested=origPrice>0?(origPrice+shipping).toFixed(2):null;
        const result={...p,newType:finalType,titleEn,description,shipping,origPrice,suggested,confidence:p.ruleType?0.98:aiType?0.85:0.5,src:p.ruleSrc||(aiType?"ai":"fallback")};
        rMapRef.current={...rMapRef.current,[p.handle]:result};
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
                  <button style={{...s.dlBtn,background:"#fff",color:"#111",border:"1.5px solid #ddd"}} onClick={()=>downloadCSV(rawRows,headers,rMap,false)}>참고용</button>
                  <button style={s.dlBtn} onClick={()=>downloadCSV(rawRows,headers,rMap,true)}>⬇ Shopify CSV</button>
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
                  {tab==="shipping"&&<><th style={s.th}>영문명</th><th style={s.th}>무게</th><th style={s.th}>배송비</th><th style={s.th}>현재가</th><th style={s.th}>→ 제안가</th></>}
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
                        <td style={s.td}><span style={{...s.pill,background:CAT_COLORS[r.newType]||"#999"}}>{r.newType}</span>{tc&&<span style={s.mark}>✓</span>}</td>
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
  srcB:{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4},
  srcRule:{background:"#e8f8ee",color:"#27AE60"},
  srcAI:{background:"#e8f0ff",color:"#2980B9"},
  srcFall:{background:"#f5f5f5",color:"#aaa"},
  brandTag:{fontSize:11,fontWeight:700,background:"#fff0f6",color:"#E91E8C",padding:"2px 8px",borderRadius:20,marginRight:4,display:"inline-block"},
  cBar:{height:4,background:"#f0f0f0",borderRadius:4,overflow:"hidden",marginBottom:3,width:50},
  cFill:{height:"100%",borderRadius:4},
  guide:{background:"#f0fff4",border:"1px solid #c6f6d5",borderRadius:12,padding:"14px 18px",fontSize:13,marginBottom:16,lineHeight:1.8},
};
