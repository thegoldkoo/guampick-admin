# GuamPick Admin

상품 분류 + 영문번역 + 배송비 계산 + Shopify CSV 출력

## 배포 (AWS Amplify)

### 1. GitHub에 올리기
```bash
git init
git add .
git commit -m "GuamPick Admin v1"
git remote add origin https://github.com/YOUR_REPO.git
git push -u origin main
```

### 2. AWS Amplify 연결
1. AWS Amplify Console → New app → Host web app
2. GitHub 연결 → 레포 선택
3. Build settings: `amplify.yml` 자동 감지됨

### 3. 환경변수 설정 ⚠️ 필수
Amplify Console → App settings → Environment variables:
```
VITE_ANTHROPIC_API_KEY = sk-ant-api03-...
```

### 4. Deploy
Push → 자동 빌드 & 배포

---

## 로컬 개발
```bash
npm install

# .env.local 파일 생성
echo "VITE_ANTHROPIC_API_KEY=sk-ant-api03-..." > .env.local

npm run dev
# → http://localhost:5173
```

---

## 기능
| 페이지 | 기능 |
|---|---|
| 대시보드 | 운영 현황, 워크플로우 가이드 |
| 상품 분류 | CSV/ZIP → 35개 카테고리 + 영문번역 + 배송비 + Shopify CSV |
| 상세설명 생성 | 단일 상품 영문 설명 AI 생성 |
| 브랜드 관리 | 13개 K-Beauty 브랜드 태그 규칙 |
| 배송비 계산기 | kg 올림 × $3 |
