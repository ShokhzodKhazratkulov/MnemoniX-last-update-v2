# MnemoniX Changelog & Improvement Log

## [2026-03-31] - Translation & Linter Fixes
### Fixed
- **Duplicate Translation Keys**: Removed multiple duplicate property names in `src/constants/translations.ts` across English, Uzbek, and Russian blocks (TS1117).
- **Prop Drilling**: Fixed missing `t` prop in `MnemonicCard` when rendered from `App.tsx` and `Flashcards.tsx` (TS2741).
- **Flashcards Localization**: Updated `Flashcards.tsx` to correctly handle full translation context (`fullT`) for top-level UI elements like "Shuffle" and "Mark Mastered".

### Improved
- **Linter Compliance**: Ran `tsc --noEmit` to ensure codebase is free of type errors.
- **Build Stability**: Verified successful production build using `npm run build`.

## [2026-03-31] - Initial AI Integration
### Added
- **Gemini 3.1 Integration**: Implemented text generation for mnemonic stories using `@google/genai`.
- **Vertex AI Image Generation**: Integrated image generation to visualize mnemonic stories.
- **Multi-language Support**: Added initial translation infrastructure for EN, UZ, and RU.

## [2026-03-30] - Core Infrastructure
### Added
- **Firebase Setup**: Configured Firestore and Authentication.
- **Base UI Components**: Created `MnemonicCard`, `Flashcards`, and `SearchPage`.
- **Navigation**: Implemented view-based routing in `App.tsx`.
