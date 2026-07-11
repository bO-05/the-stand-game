import './stand.css';
import { TIFO_DATA_URI } from './assets/AssetData';
import { LevelGame } from './game/LevelGame';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');

if (!canvas) throw new Error('Missing #game-canvas element.');

document.documentElement.style.setProperty('--tifo-image', `url("${TIFO_DATA_URI}")`);

const game = new LevelGame(canvas);
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
