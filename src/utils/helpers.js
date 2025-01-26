const fs = require('fs');

const POSITIONS_FILE = 'positions.json';

function loadPositions() {
  try {
    return JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function savePositions(positions) {
  fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
}

module.exports = {
  loadPositions,
  savePositions,
};
