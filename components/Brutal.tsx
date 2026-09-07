// DEPRECATED SHIM — the neobrutalist offset-shadow primitive has been removed.
// Its flat Bauhaus replacement lives in components/BauhausCard.tsx (§Part 2).
// This file only re-exports so screens not yet swept keep compiling; it is
// deleted once every import has moved to '../components/BauhausCard'.
export {
  BauhausCard,
  BauhausButton,
  BauhausInput,
  BauhausHeader,
  BauhausText,
  BrutalBlock,
  BrutalButton,
  BrutalInput,
  BrutalHeader,
  BrutalText,
  Circle,
  Square,
  Triangle,
  textOn,
  theme,
  fonts,
} from './BauhausCard';
