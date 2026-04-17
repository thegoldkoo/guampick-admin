import { Routes, Route, NavLink } from "react-router-dom";
import Dashboard    from "./pages/Dashboard";
import Classifier   from "./pages/Classifier";
import DescGen      from "./pages/DescGen";
import BrandManager from "./pages/BrandManager";
import ShippingCalc from "./pages/ShippingCalc";

const NAV = [
  { to: "/",           icon: "📊", label: "대시보드" },
  { to: "/classifier", icon: "🔄", label: "상품 분류" },
  { to: "/descgen",    icon: "✍️",  label: "상세설명 생성" },
  { to: "/brands",     icon: "🏷",  label: "브랜드 관리" },
  { to: "/shipping",   icon: "🚢",  label: "배송비 계산기" },
];

export default function App() {
  return (
    <div style={s.shell}>
      <aside style={s.sidebar}>
        <div style={s.sideTop}>
          <div style={s.logoMark}>GP</div>
          <div>
            <div style={s.logoText}>GuamPick</div>
            <div style={s.logoSub}>Admin</div>
          </div>
        </div>
        <nav style={s.nav}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              style={({ isActive }) => ({ ...s.navItem, ...(isActive ? s.navOn : {}) })}>
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div style={s.sideFooter}>
          <span style={s.onlineDot} />
          <span style={s.footerTxt}>guampick.com</span>
        </div>
      </aside>

      <main style={s.main}>
        <Routes>
          <Route path="/"           element={<Dashboard />} />
          <Route path="/classifier" element={<Classifier />} />
          <Route path="/descgen"    element={<DescGen />} />
          <Route path="/brands"     element={<BrandManager />} />
          <Route path="/shipping"   element={<ShippingCalc />} />
        </Routes>
      </main>
    </div>
  );
}

const s = {
  shell:      { display:"flex", minHeight:"100vh" },
  sidebar:    { width:220, flexShrink:0, background:"#111", display:"flex", flexDirection:"column", position:"sticky", top:0, height:"100vh" },
  sideTop:    { display:"flex", alignItems:"center", gap:10, padding:"24px 20px 20px" },
  logoMark:   { width:36, height:36, background:"#FF6B35", borderRadius:8, fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:14, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },
  logoText:   { fontFamily:"'Syne',sans-serif", fontWeight:800, fontSize:14, color:"#fff" },
  logoSub:    { fontSize:10, color:"#555" },
  nav:        { flex:1, padding:"8px 12px", display:"flex", flexDirection:"column", gap:2 },
  navItem:    { display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:8, fontSize:13, fontWeight:500, color:"#666", textDecoration:"none", transition:"all 0.15s" },
  navOn:      { background:"#1e1e1e", color:"#FF6B35" },
  sideFooter: { padding:"16px 20px", borderTop:"1px solid #1e1e1e", display:"flex", alignItems:"center", gap:8 },
  onlineDot:  { width:6, height:6, borderRadius:"50%", background:"#27AE60", display:"block" },
  footerTxt:  { fontSize:11, color:"#555" },
  main:       { flex:1, minWidth:0, padding:"32px", overflowY:"auto" },
};
