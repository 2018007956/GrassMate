# GrassMate Download Site

GrassMate macOS `.dmg` 배포용 정적 웹사이트입니다.

## 기능
- GitHub Releases API에서 최신 릴리즈 조회
- 최신 `.dmg` 파일 다운로드 버튼 자동 연결
- 릴리즈 태그/날짜/파일크기/파일명 노출
- SHA256 확인용 명령어와 체크섬 파일 링크 지원

## 로컬 실행
프로젝트 루트에서:

```bash
npm run site:dev
```

## 빌드
프로젝트 루트에서:

```bash
npm run site:build
```

빌드 결과물: `website/dist/`

## Vercel 배포 (같은 레포 사용)
1. Vercel에서 이 레포를 Import
2. Build Command: `npm run site:build`
3. Output Directory: `website/dist`
4. Install Command: `npm install`

## 릴리즈 소스 설정
기본 리포지토리 정보는 `website/main.js`의 `SITE_CONFIG`에서 수정할 수 있습니다.
