import { useNavigate } from "react-router-dom";

const QUICK = [
  { label:"상품 분류", desc:"CSV/ZIP → AI 재분류 + 번역 + 배송비", to:"/classifier", color:"#FF6B35", icon:"🔄" },
  { label:"상세설명 생성", desc:"단일 상품 영문 설명 AI 생성", to:"/descgen", color:"#8E44AD", icon:"✍️" },
  { label:"브랜드 관리", desc:"13개 K-Beauty 브랜드 태그 규칙 확인", to:"/brands", color:"#E91E8C", icon:"🏷" },
  { label:"배송비 계산기", desc:"무게 입력 → kg 올림 × $3", to:"/shipping", color:"#16A085", icon:"🚢" },
];

const WORKFLOW = [
  { n:"1", t:"신규 상품 Export", d:"Shopify → 제품 → 판매채널 0 필터 → Export CSV" },
  { n:"2", t:"분류 툴 실행", d:"오전 시간대 권장 (저녁 API 과부하 가능)" },
  { n:"3", t:"결과 검토", d:"카테고리 / 영문번역 / 배송비 탭 순서로 확인" },
  { n:"4", t:"Shopify 재임포트", d:"Products → Import → Overwrite existing 체크" },
];

export default function Dashboard() {
  const nav = useNavigate();
  return (
    <div style={s.root}>
      <div style={s.hdr}>
        <h1 style={s.title}>대시보드</h1>
        <p style={s.sub}>GuamPick 상품 운영 어드민</p>
      </div>

      <div style={s.quickGrid}>
        {QUICK.map((q) => (
          <div key={q.to} style={{ ...s.qCard, borderTopColor: q.color }} onClick={() => nav(q.to)}>
            <div style={s.qTop}>
              <span style={s.qIcon}>{q.icon}</span>
              <div style={{ ...s.qDot, background: q.color }} />
            </div>
            <div style={s.qLabel}>{q.label}</div>
            <div style={s.qDesc}>{q.desc}</div>
            <div style={{ ...s.qArrow, color: q.color }}>시작 →</div>
          </div>
        ))}
      </div>

      <h2 style={s.sec}>매일 운영 워크플로우</h2>
      <div style={s.wfGrid}>
        {WORKFLOW.map((w) => (
          <div key={w.n} style={s.wfCard}>
            <div style={s.wfNum}>{w.n}</div>
            <div>
              <div style={s.wfTitle}>{w.t}</div>
              <div style={s.wfDesc}>{w.d}</div>
            </div>
          </div>
        ))}
      </div>

      <h2 style={s.sec}>시스템 정보</h2>
      <div style={s.infoGrid}>
        {[
          ["AI 모델","Claude Sonnet 4"],["배송비","kg 올림 × $3 (한국→괌)"],
          ["분류 방식","규칙 우선 + AI 보완"],["지원 형식","Shopify CSV, ZIP"],
          ["브랜드 자동감지","13개 K-Beauty"],["카테고리","35개"],
        ].map(([k,v]) => (
          <div key={k} style={s.infoItem}>
            <span style={s.infoKey}>{k}</span>
            <span style={s.infoVal}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const s = {
  root:      { animation:"slideUp 0.4s ease" },
  hdr:       { marginBottom:28 },
  title:     { fontFamily:"'Syne',sans-serif", fontSize:26, fontWeight:800, marginBottom:4 },
  sub:       { fontSize:14, color:"#888" },
  sec:       { fontFamily:"'Syne',sans-serif", fontSize:15, fontWeight:800, margin:"28px 0 12px" },
  quickGrid: { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:12 },
  qCard:     { background:"#fff", borderRadius:14, padding:"20px", borderTop:"3px solid #999", cursor:"pointer", transition:"transform 0.15s" },
  qTop:      { display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 },
  qIcon:     { fontSize:24 },
  qDot:      { width:8, height:8, borderRadius:"50%" },
  qLabel:    { fontSize:15, fontWeight:700, marginBottom:6 },
  qDesc:     { fontSize:12, color:"#888", lineHeight:1.5, marginBottom:12 },
  qArrow:    { fontSize:12, fontWeight:700 },
  wfGrid:    { display:"flex", flexDirection:"column", gap:8 },
  wfCard:    { background:"#fff", borderRadius:12, padding:"16px 20px", display:"flex", alignItems:"flex-start", gap:16 },
  wfNum:     { width:28, height:28, borderRadius:"50%", background:"#FF6B35", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, flexShrink:0 },
  wfTitle:   { fontSize:14, fontWeight:600, marginBottom:2 },
  wfDesc:    { fontSize:12, color:"#888" },
  infoGrid:  { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:8 },
  infoItem:  { background:"#fff", borderRadius:10, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" },
  infoKey:   { fontSize:12, color:"#888" },
  infoVal:   { fontSize:13, fontWeight:600 },
};
