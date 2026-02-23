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

### GitHub Actions로 DMG 자동 빌드 사용법
- 워크플로우 파일: `.github/workflows/build-dmg.yml`
- 트리거:
  - `main` 브랜치에 push
  - `v*` 태그 push
  - GitHub Actions 수동 실행 (`workflow_dispatch`)
- 동작:
  1. macOS 러너에서 Node/Rust 환경 구성
  2. `npm ci` 실행
  3. `npm run tauri:build` 실행
  4. `src-tauri/target/release/bundle/dmg/*.dmg`를 `GrassMate-dmg` 아티팩트로 업로드
  5. `v*` 태그 푸시인 경우 GitHub Release를 생성하고 DMG를 자동 첨부

#### 태그 푸시 자동 릴리즈
- `v*` 태그를 push하면 워크플로우가 자동으로 GitHub Release를 생성합니다.
- 같은 실행에서 생성된 DMG 파일이 Release assets에 자동 첨부됩니다.

#### 실제 사용 순서
1. 워크플로우 파일 포함해서 `main`에 push
   ```bash
   git add .github/workflows/build-dmg.yml
   git commit -m "ci: add macOS dmg build workflow"
   git push origin main
   ```
2. 릴리스용 태그 생성/푸시
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. GitHub 저장소 → `Releases`에서 태그 릴리스와 첨부된 DMG 확인
4. 필요 시 `Actions` → `Build macOS DMG` → `Artifacts`에서 `GrassMate-dmg` 다운로드

#### 주의
- Release 자동 생성/DMG 자동 첨부는 `v*` 태그 푸시에서만 동작합니다.
- `main` 브랜치 push나 수동 실행은 DMG 빌드 + 아티팩트 업로드까지만 수행합니다.

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
