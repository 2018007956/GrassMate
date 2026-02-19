# GrassMate 개발 문서

## 🖥️ Desktop (Tauri v2, macOS)
- 개발 실행: `npm run tauri:dev`
- `cargo metadata` 관련 PATH 에러가 나면: `PATH="$HOME/.cargo/bin:$PATH" npm run tauri:dev`
- DMG 빌드: `npm run tauri:build -- --bundles dmg`
- 로컬 빠른 빌드(.app만 생성, /Applications에 설치되지 않음):
  ```bash
  PATH="$HOME/.cargo/bin:$PATH" npm run tauri:build -- --bundles app
  open ./src-tauri/target/release/bundle/macos/GrassMate.app
  ```
- 빌드 결과: `src-tauri/target/release/bundle/dmg/*.dmg`

## ⬇️ Download Website
- 소스 경로: `website/`
- 로컬 개발: `npm run site:dev`
- 프로덕션 빌드: `npm run site:build`
- 미리보기: `npm run site:preview`

Vercel 설정 권장값:
1. Project Import: 현재 레포 선택
2. Framework Preset: `Vite`
3. Build Command: `npm run site:build`
4. Output Directory: `website/dist`
5. Install Command: `npm install`
