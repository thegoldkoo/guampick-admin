import { useState } from "react";
import { claude } from "../api";

const PROMPT = `You are a copywriter for GuamPick, a Korean grocery & beauty store in Guam.
Write a compelling 2-3 sentence English product description for Guam shoppers who miss Korean products.
Mention taste/texture/use/occasion naturally. Sound warm and personal, not corporate.
Respond ONLY with the description text.`;

export default function DescGen() {
  const [title,  setTitle]  = useState("");
  const [result, setResult] = useState("");
  const [loading,setLoading]= useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!title.trim() || loading) return;
    setLoading(true); setResult(""); setCopied(false);
    try {
      const desc = await claude(PROMPT, title, 200);
      setResult(desc);
    } catch (e) {
      setResult("오류: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const SAMPLES = ["크라운 콘칲 군옥수수 70g, 6개", "농심 신라면 멀티팩 5봉", "비비고 왕교자 만두 1.05kg", "오뚜기 3분 카레 중간맛 200g x 3", "COSRX 달팽이 에센스 96ml"];

  return (
    <div style={s.root}>
      <h1 style={s.title}>상세설명 생성</h1>
      <p style={s.sub}>한국어 상품명 → 영문 상세설명 2-3문장 자동 생성</p>

      <div style={s.card}>
        <label style={s.label}>상품명 (한국어)</label>
        <div style={s.inputRow}>
          <input style={s.input} value={title} onChange={e=>setTitle(e.target.value)}
            placeholder="예: 농심 신라면 멀티팩 5봉" onKeyDown={e=>e.key==="Enter"&&generate()}/>
          <button style={{...s.btn,...(loading?s.btnOff:{})}} onClick={generate} disabled={loading}>
            {loading ? "생성 중..." : "생성"}
          </button>
        </div>

        <div style={s.samples}>
          <span style={s.sampLabel}>샘플:</span>
          {SAMPLES.map(s2=>(
            <button key={s2} style={s.chip} onClick={()=>{ setTitle(s2); setResult(""); }}>
              {s2.split(" ").slice(0,2).join(" ")}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={s.loading}>
          <div style={s.dots}>{[0,1,2].map(i=><span key={i} style={{...s.dot,animationDelay:`${i*0.2}s`}}/>)}</div>
          <p style={{fontSize:13,color:"#888",margin:0}}>AI가 상세설명 작성 중...</p>
        </div>
      )}

      {result && !loading && (
        <div style={s.resultCard}>
          <div style={s.resultHdr}>
            <span style={s.resultTitle}>생성된 상세설명</span>
            <button style={s.copyBtn} onClick={copy}>{copied ? "✓ 복사됨" : "복사"}</button>
          </div>
          <p style={s.resultText}>{result}</p>
          <div style={s.hint}>💡 Shopify Body HTML에 붙여넣기 또는 분류 툴을 통해 자동 적용</div>
        </div>
      )}

      <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-8px)}}`}</style>
    </div>
  );
}

const s = {
  root:{animation:"slideUp 0.4s ease"},
  title:{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:800,marginBottom:4},
  sub:{fontSize:13,color:"#888",marginBottom:24},
  card:{background:"#fff",borderRadius:16,padding:"20px",marginBottom:16},
  label:{fontSize:12,fontWeight:600,color:"#555",display:"block",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"},
  inputRow:{display:"flex",gap:8,marginBottom:12},
  input:{flex:1,padding:"11px 14px",fontSize:14,border:"1.5px solid #e0e0e0",borderRadius:10,outline:"none"},
  btn:{padding:"11px 20px",background:"#FF6B35",color:"#fff",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"},
  btnOff:{opacity:0.65,cursor:"not-allowed"},
  samples:{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"},
  sampLabel:{fontSize:11,color:"#aaa"},
  chip:{fontSize:11,padding:"4px 10px",background:"#f5f5f5",border:"none",borderRadius:20,cursor:"pointer",color:"#555"},
  loading:{background:"#fff",borderRadius:16,padding:"32px",textAlign:"center"},
  dots:{display:"flex",justifyContent:"center",gap:6,marginBottom:12},
  dot:{width:8,height:8,background:"#FF6B35",borderRadius:"50%",display:"inline-block",animation:"bounce 1.2s infinite"},
  resultCard:{background:"#fff",borderRadius:16,overflow:"hidden"},
  resultHdr:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",borderBottom:"1px solid #f5f5f5"},
  resultTitle:{fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:800},
  copyBtn:{padding:"7px 16px",background:"#111",color:"#fff",border:"none",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer"},
  resultText:{padding:"20px",fontSize:14,color:"#333",lineHeight:1.7},
  hint:{background:"#f6f9ff",padding:"12px 20px",fontSize:12,color:"#666",borderTop:"1px solid #eef"},
};
