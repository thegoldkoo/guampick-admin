const BRANDS = [
  { keyword:"bibigo / bi bi go",    tag:"Bibigo",              url:"/collections/bibigo" },
  { keyword:"black & white chef",   tag:"Black and White Chef",url:"/collections/black-and-white-chef" },
  { keyword:"dr.g / dr g",          tag:"Dr.G",                url:"/collections/dr-g" },
  { keyword:"round lab / roundlab", tag:"Round Lab",           url:"/collections/round-lab" },
  { keyword:"cosrx",                tag:"COSRX",               url:"/collections/cosrx" },
  { keyword:"innisfree",            tag:"Innisfree",           url:"/collections/innisfree" },
  { keyword:"laneige",              tag:"Laneige",             url:"/collections/laneige" },
  { keyword:"sulwhasoo",            tag:"Sulwhasoo",           url:"/collections/sulwhasoo" },
  { keyword:"etude",                tag:"Etude",               url:"/collections/etude" },
  { keyword:"some by mi / somebymi",tag:"Some By Mi",          url:"/collections/some-by-mi" },
  { keyword:"skin1004",             tag:"Skin1004",            url:"/collections/skin1004" },
  { keyword:"anua",                 tag:"Anua",                url:"/collections/anua" },
  { keyword:"torriden",             tag:"Torriden",            url:"/collections/torriden" },
];

export default function BrandManager() {
  return (
    <div style={s.root}>
      <h1 style={s.title}>브랜드 관리</h1>
      <p style={s.sub}>자동 감지 브랜드 태그 규칙 (총 13개) — 상품명에서 감지되면 컬렉션에 자동 편입</p>

      <div style={s.infoBox}>
        <span style={s.infoIcon}>💡</span>
        <span style={s.infoText}>스마트 컬렉션 조건: <b>태그 = 브랜드명</b> — 분류 툴이 이 태그를 기존 Tags에 자동 병합합니다</span>
      </div>

      <div style={s.table}>
        <div style={s.thead}>
          {["감지 키워드","추가 태그","컬렉션 URL"].map(h=><div key={h} style={s.th}>{h}</div>)}
        </div>
        {BRANDS.map((b, i) => (
          <div key={b.tag} style={{...s.row,...(i%2===0?{}:s.rowAlt)}}>
            <div style={s.td}><span style={s.keyword}>{b.keyword}</span></div>
            <div style={s.td}><span style={s.tag}>{b.tag}</span></div>
            <div style={s.td}><a href={`https://guampick.com${b.url}`} target="_blank" rel="noreferrer" style={s.link}>{b.url}</a></div>
          </div>
        ))}
      </div>

      <div style={s.noteBox}>
        <div style={s.noteTitle}>📌 브랜드 추가 방법</div>
        <div style={s.noteText}>
          새 브랜드를 추가하려면 <code style={s.code}>src/pages/Classifier.jsx</code>의 <code style={s.code}>BRAND_RULES</code> 배열에 항목을 추가하세요.
        </div>
        <pre style={s.pre}>{`{ rx: /새브랜드/i, tag: "새브랜드Tag" }`}</pre>
      </div>
    </div>
  );
}

const s = {
  root:{animation:"slideUp 0.4s ease"},
  title:{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:800,marginBottom:4},
  sub:{fontSize:13,color:"#888",marginBottom:20},
  infoBox:{display:"flex",alignItems:"center",gap:10,background:"#fff8f0",border:"1px solid #ffe0c8",borderRadius:10,padding:"12px 16px",marginBottom:20,fontSize:13},
  infoIcon:{fontSize:18},
  infoText:{color:"#555"},
  table:{background:"#fff",borderRadius:16,overflow:"hidden",marginBottom:20},
  thead:{display:"grid",gridTemplateColumns:"1fr 1fr 1.5fr",background:"#f5f5f5",padding:"10px 16px"},
  th:{fontSize:11,fontWeight:700,color:"#999",textTransform:"uppercase",letterSpacing:"0.04em"},
  row:{display:"grid",gridTemplateColumns:"1fr 1fr 1.5fr",padding:"12px 16px",borderBottom:"1px solid #f8f8f8",alignItems:"center"},
  rowAlt:{background:"#fafafa"},
  td:{fontSize:13},
  keyword:{fontSize:12,color:"#555",fontFamily:"monospace"},
  tag:{fontSize:12,fontWeight:700,background:"#fff0f6",color:"#E91E8C",padding:"3px 10px",borderRadius:20},
  link:{color:"#2980B9",textDecoration:"none",fontSize:12},
  noteBox:{background:"#fff",borderRadius:14,padding:"20px"},
  noteTitle:{fontSize:14,fontWeight:700,marginBottom:8},
  noteText:{fontSize:13,color:"#555",marginBottom:10},
  code:{background:"#f0f0f0",padding:"2px 6px",borderRadius:4,fontSize:12,fontFamily:"monospace"},
  pre:{background:"#1e1e1e",color:"#4ec9b0",padding:"12px 16px",borderRadius:8,fontSize:12,fontFamily:"monospace",overflowX:"auto"},
};
