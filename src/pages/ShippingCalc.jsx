import { useState } from "react";

const RATE = 3;
function calc(kg) { return Math.ceil(Math.max(parseFloat(kg)||0, 0.1)) * RATE; }

const EXAMPLES = [
  { name:"햇반 잡곡밥 130g × 12개", kg:1.56 },
  { name:"농심 신라면 120g × 5봉",  kg:0.60 },
  { name:"비비고 왕교자 만두 1.05kg", kg:1.05 },
  { name:"크라운 콘칲 70g × 6개",   kg:0.42 },
  { name:"COSRX 달팽이 에센스 96ml", kg:0.15 },
];

export default function ShippingCalc() {
  const [kg, setKg] = useState("");

  const charged = Math.ceil(Math.max(parseFloat(kg)||0, 0.1));
  const fee = calc(kg);

  return (
    <div style={s.root}>
      <h1 style={s.title}>배송비 계산기</h1>
      <p style={s.sub}>한국 → 괌 · kg 올림 × $3</p>

      <div style={s.card}>
        <label style={s.label}>무게 입력 (kg)</label>
        <div style={s.inputRow}>
          <input style={s.input} type="number" step="0.1" min="0" value={kg}
            onChange={e=>setKg(e.target.value)} placeholder="예: 1.56"/>
          <div style={s.result}>
            <span style={s.resultKg}>{kg ? `${charged}kg 과금` : "—"}</span>
            <span style={s.resultFee}>{kg ? `$${fee.toFixed(2)}` : "$—"}</span>
          </div>
        </div>
        {kg && (
          <div style={s.formula}>
            {parseFloat(kg).toFixed(2)}kg → 올림 → <b>{charged}kg</b> × $3 = <b style={{color:"#E74C3C"}}>${fee.toFixed(2)}</b>
          </div>
        )}
      </div>

      <h2 style={s.sec}>예시 상품 배송비</h2>
      <div style={s.exGrid}>
        {EXAMPLES.map(ex => {
          const c = Math.ceil(ex.kg); const f = c * RATE;
          return (
            <div key={ex.name} style={s.exCard} onClick={()=>setKg(String(ex.kg))}>
              <div style={s.exName}>{ex.name}</div>
              <div style={s.exRow}>
                <span style={s.exKg}>{ex.kg}kg → {c}kg</span>
                <span style={s.exFee}>${f.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={s.ruleBox}>
        <div style={s.ruleTitle}>📋 배송비 규칙</div>
        <div style={s.ruleGrid}>
          {[[1,"$3"],[2,"$6"],[3,"$9"],[4,"$12"],[5,"$15"],[10,"$30"]].map(([w,f])=>(
            <div key={w} style={s.ruleItem}>
              <span style={s.ruleW}>{w}kg 이하</span>
              <span style={s.ruleF}>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const s = {
  root:{animation:"slideUp 0.4s ease"},
  title:{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:800,marginBottom:4},
  sub:{fontSize:13,color:"#888",marginBottom:24},
  card:{background:"#fff",borderRadius:16,padding:"20px",marginBottom:24},
  label:{fontSize:12,fontWeight:600,color:"#555",display:"block",marginBottom:8,textTransform:"uppercase"},
  inputRow:{display:"flex",gap:12,alignItems:"center"},
  input:{flex:1,padding:"13px 16px",fontSize:18,border:"2px solid #e0e0e0",borderRadius:12,outline:"none",fontWeight:600},
  result:{display:"flex",flexDirection:"column",alignItems:"flex-end"},
  resultKg:{fontSize:12,color:"#888"},
  resultFee:{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,color:"#FF6B35"},
  formula:{marginTop:10,fontSize:13,color:"#666",padding:"8px 12px",background:"#f8f8f8",borderRadius:8},
  sec:{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:800,marginBottom:12},
  exGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10,marginBottom:24},
  exCard:{background:"#fff",borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"transform 0.15s"},
  exName:{fontSize:12,color:"#555",marginBottom:8},
  exRow:{display:"flex",justifyContent:"space-between",alignItems:"center"},
  exKg:{fontSize:12,color:"#888"},
  exFee:{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:800,color:"#E74C3C"},
  ruleBox:{background:"#fff",borderRadius:16,padding:"20px"},
  ruleTitle:{fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:800,marginBottom:12},
  ruleGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:8},
  ruleItem:{background:"#f8f8f8",borderRadius:10,padding:"12px",textAlign:"center"},
  ruleW:{display:"block",fontSize:12,color:"#888",marginBottom:4},
  ruleF:{display:"block",fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,color:"#111"},
};
